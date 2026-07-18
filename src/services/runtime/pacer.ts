/**
 * 解析事件排版缓冲：serve 的并发抓取让 item_listed 按 ~fetch_workers 一波波
 * 到达，直接上屏就是一次跳 5~8 条。把事件排队、按节拍分批放行 —— 队首事件
 * 立即放行（单视频零延迟），之后每拍放行 max(1, 积压/catchUpDivisor) 条，
 * 积压越多放行越快，长列表不会被人为拖慢；解析结束时 flush() 瞬时清空。
 */
export interface EventPacer<T> {
  enqueue(event: T): void;
  /** 立刻放行全部积压（解析结束/失败时调用，避免丢尾巴）。 */
  flush(): void;
  /** 丢弃积压并停表（新一轮解析开始时调用）。 */
  stop(): void;
}

export function createEventPacer<T>(
  drain: (events: T[]) => void,
  {
    intervalMs = 60,
    catchUpDivisor = 10,
  }: { intervalMs?: number; catchUpDivisor?: number } = {},
): EventPacer<T> {
  let queue: T[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = () => {
    if (queue.length === 0) {
      // 空转一拍即停表；下一条 enqueue 会重新起搏。
      stopTimer();
      return;
    }
    const take = Math.max(1, Math.floor(queue.length / catchUpDivisor));
    drain(queue.splice(0, take));
  };

  return {
    enqueue(event) {
      queue.push(event);
      if (timer !== null) {
        return;
      }
      // 队列原本为空：首条立即上屏，再按节拍放行后续。
      tick();
      timer = setInterval(tick, intervalMs);
    },
    flush() {
      stopTimer();
      if (queue.length > 0) {
        const rest = queue;
        queue = [];
        drain(rest);
      }
    },
    stop() {
      stopTimer();
      queue = [];
    },
  };
}
