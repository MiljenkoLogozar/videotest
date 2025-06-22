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
    // For now, just clear the canvas - video rendering will be handled by HTML video element
    // until we implement proper frame store system
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw a simple indicator to show the renderer is working
    if (this.asset) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      this.ctx.font = '16px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        `Frame: ${tick.frame} | Time: ${tick.time.toFixed(2)}s`,
        this.canvas.width / 2,
        this.canvas.height / 2
      );
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