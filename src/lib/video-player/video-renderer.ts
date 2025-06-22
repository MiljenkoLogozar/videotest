/**
 * Canvas-based video renderer inspired by Al Jazeera's IOVideoRenderer
 * Renders video frames to canvas for frame-accurate playback
 */

import type { FrameTick } from './frame-ticker';
import type { LocalVideoAsset } from '@/lib/storage/local-storage';

export class VideoRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _lastRenderedFrame: number = -1;
  private _timelineDuration: number = 0;
  private _activeFrame: ImageBitmap | null = null;
  
  public frameStore: unknown = null;
  public state: unknown = null;
  public src: string | null = null;
  public asset: LocalVideoAsset | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  reset(): void {
    this._lastRenderedFrame = -1;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render frame based on tick - called from requestAnimationFrame
   */
  async render(tick: FrameTick): Promise<void> {
    let duration = 0;
    if (this.state) {
      duration = this.state.duration;
    }

    // Skip if no change or no frame store
    if (!tick || 
        (tick.frame === this._lastRenderedFrame && 
         this._timelineDuration === duration) || 
        !this.frameStore) {
      return;
    }

    this._activeFrame = null;

    if (this.state) {
      // Timeline mode - render composite
      this._timelineDuration = this.state.duration;
      // TODO: Implement timeline rendering when needed
    } else if (this.src && this.asset) {
      // Source player mode - render single video
      await this.renderSourceFrame(tick.frame);
    }

    if (this._activeFrame) {
      this._lastRenderedFrame = tick.frame;
      this.ctx.drawImage(
        this._activeFrame, 
        0, 0, 
        this.canvas.width, 
        this.canvas.height
      );
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private async renderSourceFrame(frameNumber: number): Promise<void> {
    if (!this.asset) return;

    // For now, we'll create a simple frame from the video element
    // In a full implementation, this would use a proper frame store
    if (this.frameStore && typeof this.frameStore === 'object' && this.frameStore !== null && 'getFrame' in this.frameStore) {
      const frameStore = this.frameStore as { getFrame: (frame: number, src: string | null) => unknown };
      const frame = frameStore.getFrame(frameNumber, this.src);
      if (frame) {
        try {
          this._activeFrame = await createImageBitmap(frame as ImageBitmapSource);
        } catch (error) {
          console.warn('Failed to create image bitmap:', error);
        }
      }
    }
  }

  setFrameStore(frameStore: unknown): void {
    this.frameStore = frameStore;
  }

  setState(state: unknown): void {
    this.state = state;
    if (this.state && typeof this.state === 'object' && 'items' in this.state && Array.isArray(this.state.items) && this.state.items.length === 0) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  setSrc(src: string | null): void {
    this.src = src;
  }

  setAsset(asset: LocalVideoAsset | null): void {
    this.asset = asset;
  }
}