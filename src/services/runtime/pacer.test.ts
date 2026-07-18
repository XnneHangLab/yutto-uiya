import { vi } from 'vitest';
import { createEventPacer } from './pacer';

describe('createEventPacer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('releases the first event immediately and paces the rest', () => {
    const drained: number[] = [];
    const pacer = createEventPacer<number>((events) => drained.push(...events));

    // 一波 5 条同时到达（fetch_workers 车队效应）
    for (const n of [1, 2, 3, 4, 5]) pacer.enqueue(n);

    // 首条立即上屏，其余排队
    expect(drained).toEqual([1]);

    vi.advanceTimersByTime(60);
    expect(drained).toEqual([1, 2]);
    vi.advanceTimersByTime(60 * 3);
    expect(drained).toEqual([1, 2, 3, 4, 5]);
  });

  it('drains faster when the backlog is large', () => {
    const drained: number[] = [];
    const pacer = createEventPacer<number>((events) => drained.push(...events));

    for (let n = 0; n < 100; n++) pacer.enqueue(n);
    // 首拍：立即 1 条 + 积压 99
    expect(drained.length).toBe(1);
    // 下一拍放行 floor(99/10)=9 条，而不是 1 条
    vi.advanceTimersByTime(60);
    expect(drained.length).toBe(10);
  });

  it('restarts pacing when new events arrive after the queue drained', () => {
    const drained: number[] = [];
    const pacer = createEventPacer<number>((events) => drained.push(...events));

    pacer.enqueue(1);
    vi.advanceTimersByTime(600);
    expect(drained).toEqual([1]);

    pacer.enqueue(2);
    expect(drained).toEqual([1, 2]);
  });

  it('flush releases everything instantly; stop discards the backlog', () => {
    const drained: number[] = [];
    const pacer = createEventPacer<number>((events) => drained.push(...events));

    for (const n of [1, 2, 3, 4]) pacer.enqueue(n);
    pacer.flush();
    expect(drained).toEqual([1, 2, 3, 4]);

    for (const n of [5, 6, 7]) pacer.enqueue(n);
    pacer.stop();
    vi.advanceTimersByTime(600);
    expect(drained).toEqual([1, 2, 3, 4, 5]); // 5 是 stop 前已立即放行的首条
  });
});
