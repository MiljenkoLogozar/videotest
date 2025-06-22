// Core Types for Video Editor

export interface Project {
  id: string;
  title: string;
  duration: number; // seconds
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  tracks: Track[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Track {
  id: string;
  projectId: string;
  type: TrackType;
  index: number; // Track order
  items: TrackItem[];
}

export interface TrackItem {
  id: string;
  trackId: string;
  type: ItemType;
  startTime: number; // seconds
  duration: number; // seconds
  trimStart: number; // seconds trimmed from start
  trimEnd: number; // seconds trimmed from end
  mediaUrl?: string; // S3 URL to segments or graphics
  settings: ItemSettings;
}

export interface VideoAsset {
  id: string;
  originalUrl: string;
  segmentsUrl: string; // S3 path to HLS segments
  thumbnailUrls: string[]; // Array of thumbnail URLs
  waveformData?: ArrayBuffer;
  metadata: VideoMetadata;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  size: number; // file size in bytes
}

export interface VideoSegments {
  segments: Blob[]; // TS segments
  metadata: VideoMetadata;
  thumbnails: Blob[]; // Generated thumbnails
  waveform: Float32Array; // Audio waveform data
  playlistUrl: string; // M3U8 playlist URL
}

export interface GraphicsItem {
  id: string;
  type: 'text' | 'image' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  startTime: number;
  duration: number;
  fadeIn?: number; // fade in duration
  fadeOut?: number; // fade out duration
  settings: GraphicsSettings;
}

export interface GraphicsSettings {
  // Text settings
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  
  // Image settings
  imageUrl?: string;
  opacity?: number;
  
  // Shape settings
  shapeType?: 'rectangle' | 'circle' | 'line';
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ItemSettings {
  volume?: number; // 0-1
  muted?: boolean;
  effects?: Effect[];
  graphics?: GraphicsItem[];
}

export interface Effect {
  id: string;
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'fade';
  parameters: Record<string, number>;
}

export interface FrameCache {
  videoId: string;
  frameNumber: number;
  frame: VideoFrame | ImageBitmap;
  timestamp: number;
}

export interface TimelineState {
  currentTime: number; // current playhead position in seconds
  zoom: number; // pixels per second
  offset: number; // horizontal scroll offset
  selectedItems: string[]; // selected track item IDs
  isPlaying: boolean;
  duration: number; // total project duration
}

export interface ExportSettings {
  format: 'mp4' | 'webm';
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  bitrate: number;
  quality: 'low' | 'medium' | 'high';
}

// Enums
export enum TrackType {
  VIDEO = 'video',
  AUDIO = 'audio',
  GRAPHICS = 'graphics'
}

export enum ItemType {
  VIDEO_CLIP = 'video_clip',
  AUDIO_CLIP = 'audio_clip', 
  GRAPHICS = 'graphics',
  TEXT = 'text'
}

// Event Types
export interface TimelineEvent {
  type: 'seek' | 'play' | 'pause' | 'item_selected' | 'item_moved' | 'item_trimmed';
  payload: any;
  timestamp: number;
}

export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  originalStartTime: number;
  snapGrid?: number; // snap to grid in seconds
}

export interface TrimState {
  isTrimming: boolean;
  handle: 'left' | 'right';
  startX: number;
  originalTrimStart: number;
  originalDuration: number;
}

// Store interfaces
export interface VideoEditorStore {
  // Project state
  currentProject: Project | null;
  projects: Project[];
  
  // Timeline state
  timeline: TimelineState;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createProject: (title: string) => void;
  loadProject: (id: string) => Promise<void>;
  updateProject: (updates: Partial<Project>) => void;
  addTrackItem: (trackId: string, item: Omit<TrackItem, 'id'>) => void;
  updateTrackItem: (itemId: string, updates: Partial<TrackItem>) => void;
  deleteTrackItem: (itemId: string) => void;
  
  // Timeline actions
  setCurrentTime: (time: number) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setZoom: (zoom: number) => void;
  setOffset: (offset: number) => void;
  selectItems: (itemIds: string[]) => void;
}

// API Response types
export interface UploadResponse {
  videoAsset: VideoAsset;
  success: boolean;
  error?: string;
}

export interface ProcessingStatus {
  status: 'processing' | 'completed' | 'error';
  progress: number; // 0-100
  message?: string;
}