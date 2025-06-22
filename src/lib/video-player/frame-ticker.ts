/**
 * Frame-based ticker system inspired by Al Jazeera's video editor
 * Provides frame-accurate timing and playback control
 */

export interface FrameTick {
  frame: number;
  rate: number;
  time: number;
  fps: number;
}

export interface FrameBoundary {
  start: number;
  end?: number;
}

export class FrameTicker {
  private _currentTick: FrameTick;
  private _frameTick: number = 0;
  private _boundary: FrameBoundary = { start: 0 };
  private _selection: { start: number; end: number } | null = null;
  public fps: number;
  public context?: string;

  constructor(fps: number) {
    this.fps = fps;
    this._currentTick = {
      frame: 0,
      rate: 0,
      time: 0,
      fps: this.fps
    };
  }

  start(from?: number, to?: number, context?: string): void {
    if (from !== undefined || to !== undefined) {
      this._selection = {
        start: from || 0,
        end: to || this._boundary.end || 0
      };
    }

    this._currentTick.rate = 1;
    if (context) {
      this.context = context;
    }
  }

  stop(): void {
    this._currentTick.rate = 0;
    this._selection = null;
  }

  checkBoundary(boundary: FrameBoundary): boolean {
    if (!boundary) {
      return false;
    }

    let stopped = false;
    
    if (boundary.start >= 0 && this._currentTick.frame <= boundary.start) {
      this._currentTick.frame = boundary.start;
      if (this._currentTick.rate < 0) {
        this.stop();
        stopped = true;
      }
    }

    if (boundary.end && boundary.end >= 0 && this._currentTick.frame >= boundary.end) {
      this._currentTick.frame = boundary.end - 1;
      if (this._currentTick.rate > 0) {
        this.stop();
        stopped = true;
      }
    }

    return stopped;
  }

  update(): void {
    const frameTick = performance.now();
    const deltaTime = (frameTick - this._frameTick) / 1000; // Convert to seconds
    
    this._currentTick.time += deltaTime * this._currentTick.rate;
    this._currentTick.frame += deltaTime * this.fps * this._currentTick.rate;
    
    this.checkBoundary(this._boundary);
    this.checkBoundary(this._selection);
    
    this._frameTick = frameTick;
  }

  get currentTick(): FrameTick {
    return {
      time: this._currentTick.time,
      frame: Math.floor(this._currentTick.frame),
      rate: this._currentTick.rate,
      fps: this.fps
    };
  }

  set currentTick(value: FrameTick) {
    this._currentTick = { ...value };
  }

  get currentFrame(): number {
    return Math.floor(this._currentTick.frame);
  }

  set currentFrame(value: number) {
    this._currentTick.time = value / this.fps;
    this._currentTick.frame = value;
    this._selection = null;
    this.checkBoundary(this._boundary);
  }

  get currentRate(): number {
    return this._currentTick.rate;
  }

  set currentRate(value: number) {
    this._currentTick.rate = value;
    if (value === 0) {
      this.stop();
    }
  }

  get isPlaying(): boolean {
    return this.currentRate !== 0;
  }

  get boundary(): FrameBoundary {
    return this._boundary;
  }

  set boundary(value: FrameBoundary) {
    this._boundary = value;
  }

  dispose(): void {
    this.stop();
    this._selection = null;
  }
}