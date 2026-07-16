import {
  createTaskEventTranslator,
  outputDirectoryFromSnapshot,
} from './adapter';
import type { TaskEventPayload } from './rpc';

function wireEvent(overrides: Partial<TaskEventPayload>): TaskEventPayload {
  return {
    task_id: 'task-1',
    seq: 1,
    kind: 'state',
    state: 'running',
    created_at: '2026-07-16T00:00:00',
    data: {},
    ...overrides,
  };
}

describe('createTaskEventTranslator (resolve tasks)', () => {
  const context = {
    kind: 'resolve' as const,
    target: 'https://www.bilibili.com/video/BV1xx',
    outputDirectory: '/dl/root',
  };

  it('maps the state lifecycle to parse.* events', () => {
    const translate = createTaskEventTranslator(context);

    const started = translate(
      wireEvent({ seq: 1, data: { from: 'queued', to: 'running' } }),
    );
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      event: 'parse.started',
      target: context.target,
      taskId: 'task-1',
      status: 'preparing',
      timestamp: '2026-07-16T00:00:00',
    });

    const completed = translate(
      wireEvent({ seq: 2, data: { from: 'running', to: 'completed' } }),
    );
    expect(completed[0]).toMatchObject({
      event: 'parse.completed',
      status: 'completed',
    });
  });

  it('maps item_listed to parse.item with arrival index and relative dir', () => {
    const translate = createTaskEventTranslator(context);

    const first = translate(
      wireEvent({
        seq: 3,
        kind: 'item_listed',
        data: {
          avid: 'av1',
          cid: 10,
          url: 'https://www.bilibili.com/video/BV1xx?p=1',
          name: 'EP01',
          title: '某个合集',
          cover_url: 'https://i0.hdslb.com/cover.jpg',
          planned_path: '/dl/root/某个合集/EP01/EP01.mp4',
          display_group: '某个合集',
        },
      }),
    );
    expect(first[0].event).toBe('parse.item');
    expect(first[0].parseItem).toEqual({
      index: 1,
      title: 'EP01',
      url: 'https://www.bilibili.com/video/BV1xx?p=1',
      dir: '某个合集/EP01',
      cover: 'https://i0.hdslb.com/cover.jpg',
    });

    const second = translate(
      wireEvent({
        seq: 4,
        kind: 'item_listed',
        data: {
          url: 'https://www.bilibili.com/video/BV1xx?p=2',
          name: 'EP02',
          planned_path: '/dl/root/EP02.mp4',
        },
      }),
    );
    expect(second[0].parseItem).toMatchObject({ index: 2, dir: '' });
  });

  it('drops duplicated seqs from the replay/live overlap', () => {
    const translate = createTaskEventTranslator(context);
    const event = wireEvent({ seq: 5, data: { to: 'running' } });

    expect(translate(event)).toHaveLength(1);
    expect(translate(event)).toHaveLength(0);
    expect(
      translate(wireEvent({ seq: 4, data: { to: 'running' } })),
    ).toHaveLength(0);
  });

  it('maps failed state to parse.failed with the wire error message', () => {
    const translate = createTaskEventTranslator(context);
    const failed = translate(
      wireEvent({
        seq: 6,
        data: {
          from: 'running',
          to: 'failed',
          error: { code: 'E1', type: 'NotFoundError', message: '视频不存在' },
        },
      }),
    );
    expect(failed[0]).toMatchObject({
      event: 'parse.failed',
      status: 'failed',
      message: '视频不存在',
    });
  });
});

describe('createTaskEventTranslator (download tasks)', () => {
  const context = {
    kind: 'download' as const,
    target: 'https://www.bilibili.com/video/BV1yy',
  };

  it('maps the state lifecycle to download.* events', () => {
    const translate = createTaskEventTranslator(context);

    expect(
      translate(wireEvent({ seq: 1, data: { to: 'queued' } }))[0],
    ).toMatchObject({ event: 'download.queued', status: 'queued' });
    expect(
      translate(wireEvent({ seq: 2, data: { to: 'running' } }))[0],
    ).toMatchObject({ event: 'download.started', status: 'downloading' });
    expect(
      translate(wireEvent({ seq: 3, data: { to: 'cancelled' } }))[0],
    ).toMatchObject({ event: 'download.cancelled', status: 'cancelled' });
  });

  it('maps progress to download.file_progress with byte formatting', () => {
    const translate = createTaskEventTranslator(context);
    const [event] = translate(
      wireEvent({
        seq: 4,
        kind: 'progress',
        data: {
          phase: 'downloading',
          current: 52_428_800,
          total: 104_857_600,
          speed_per_second: 1_048_576,
          unit: 'bytes',
        },
      }),
    );

    expect(event).toMatchObject({
      event: 'download.file_progress',
      status: 'downloading',
      desc: '下载中',
      percent: 50,
      downloaded: '50.0 MiB',
      total: '100.0 MiB',
      progressCurrent: 52_428_800,
      progressTotal: 104_857_600,
      progressUnit: 'bytes',
    });
  });

  it('keeps unknown kinds visible as generic download events', () => {
    const translate = createTaskEventTranslator(context);
    const [event] = translate(
      wireEvent({ seq: 5, kind: 'future_kind', data: { hello: 'world' } }),
    );
    expect(event.event).toBe('download.future_kind');
    expect(event.message).toContain('hello');
  });

  it('describes stage and artifact events for the console', () => {
    const translate = createTaskEventTranslator(context);

    expect(
      translate(
        wireEvent({
          seq: 6,
          kind: 'stage',
          data: { name: 'postprocessing', item: 'EP01' },
        }),
      )[0].message,
    ).toBe('后处理中: EP01');
    expect(
      translate(
        wireEvent({
          seq: 7,
          kind: 'artifact_created',
          data: { path: '/dl/root/EP01.mp4', item: 'EP01' },
        }),
      )[0].message,
    ).toBe('产物: /dl/root/EP01.mp4');
  });
});

describe('outputDirectoryFromSnapshot', () => {
  it('extracts payload.output.directory', () => {
    expect(
      outputDirectoryFromSnapshot({
        payload: { output: { directory: '/dl/root' } },
      }),
    ).toBe('/dl/root');
  });

  it('returns undefined when the payload has no directory', () => {
    expect(outputDirectoryFromSnapshot({ payload: {} })).toBeUndefined();
    expect(
      outputDirectoryFromSnapshot({ payload: { output: 'invalid' } }),
    ).toBeUndefined();
  });
});
