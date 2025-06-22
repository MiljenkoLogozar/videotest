'use client';

import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Settings, Upload as UploadIcon } from 'lucide-react';
import FileUpload from '@/components/FileUpload/FileUpload';
import VideoPlayer from '@/components/VideoPlayer/VideoPlayer';
import { useCurrentProject, useTimeline, useTimelineActions, useProjectActions, useVideoEditorStore } from '@/lib/stores/video-editor-store';
import { localVideoStorage, generateAssetId } from '@/lib/storage/local-storage';
import type { VideoSegments } from '@/types';
import type { LocalVideoAsset } from '@/lib/storage/local-storage';

export default function VideoEditorPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoCount, setVideoCount] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<LocalVideoAsset | null>(null);

  const currentProject = useCurrentProject();
  const timeline = useTimeline();
  const { play, pause, seek, setCurrentTime } = useTimelineActions();
  const { createProject } = useProjectActions();

  useEffect(() => {
    // Ensure we're on the client side
    if (typeof window !== 'undefined') {
      setHasMounted(true);
      // Initialize video count with current assets
      setVideoCount(localVideoStorage.getStats().assetsCount);
    }
  }, []);

  // Create a default project on mount (only after hydration)
  useEffect(() => {
    if (hasMounted && !currentProject) {
      createProject('My Video Project');
    }
  }, [hasMounted, currentProject, createProject]);

  // Cleanup local storage on unmount
  useEffect(() => {
    return () => {
      // Clean up blob URLs when component unmounts
      localVideoStorage.cleanup();
    };
  }, []);

  const handleFileProcessed = (segments: VideoSegments, file: File) => {
    console.log('Video processed:', {
      segments: segments.segments.length,
      thumbnails: segments.thumbnails.length,
      metadata: segments.metadata,
      waveform: segments.waveform.length
    });
    
    // Store the processed video locally
    const assetId = generateAssetId();
    const localAsset = localVideoStorage.storeVideoAsset(
      assetId,
      file.name,
      file.size,
      segments
    );
    
    console.log('Video stored locally:', {
      id: localAsset.id,
      fileName: localAsset.fileName,
      segmentUrls: localAsset.segmentUrls.length,
      thumbnailUrls: localAsset.thumbnailUrls.length
    });
    
    // Show storage stats
    const stats = localVideoStorage.getStats();
    console.log('Local storage stats:', stats);
    
    setShowUpload(false);
    setError(null);
    
    // Update video count to trigger re-render of video list
    setVideoCount(prev => prev + 1);
    
    // TODO: Add the video to the timeline with local asset
    // This will be implemented when we create the timeline component
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    console.error('Video processing error:', errorMessage);
  };

  const handleVideoSelect = (asset: LocalVideoAsset) => {
    console.log('Selected video asset:', asset);
    console.log('Video duration:', asset.metadata.duration);
    console.log('Current timeline duration:', timeline.duration);
    
    setSelectedVideo(asset);
    
    // Update timeline duration to match the selected video's duration
    const { updateProject } = useVideoEditorStore.getState();
    if (currentProject) {
      console.log('Updating project duration to:', asset.metadata.duration);
      updateProject({ duration: asset.metadata.duration });
    }
  };

  const handleVideoTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handleVideoPlay = () => {
    play();
  };

  const handleVideoPause = () => {
    pause();
  };

  const handleVideoSeek = (time: number) => {
    seek(time);
  };

  const handleSourceProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedVideo) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * selectedVideo.metadata.duration;
    
    // Ensure time is within bounds
    const clampedTime = Math.max(0, Math.min(newTime, selectedVideo.metadata.duration));
    console.log('Source progress click:', {
      percentage,
      newTime,
      clampedTime,
      videoDuration: selectedVideo.metadata.duration,
      timelineDuration: timeline.duration
    });
    seek(clampedTime);
  };

  const handleProgramProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (timeline.duration === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * timeline.duration;
    
    // Ensure time is within bounds
    const clampedTime = Math.max(0, Math.min(newTime, timeline.duration));
    seek(clampedTime);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeWithFrames = (seconds: number, fps: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * fps);
    
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  if (!hasMounted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">Video Editor</h1>
            {currentProject && (
              <span className="text-gray-400">• {currentProject.title}</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              <UploadIcon className="h-4 w-4" />
              <span>Upload Video</span>
            </button>
            <button className="p-2 hover:bg-gray-700 rounded-md transition-colors">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Upload Modal - Full Screen Overlay */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="w-full max-w-2xl mx-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Upload Video</h2>
                <button
                  onClick={() => setShowUpload(false)}
                  className="p-2 hover:bg-gray-700 rounded-md transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <FileUpload
                onFileProcessed={handleFileProcessed}
                onError={handleError}
              />
              
              {error && (
                <div className="mt-4 p-4 bg-red-900 border border-red-700 rounded-md">
                  <p className="text-red-100">{error}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Video Files */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Video Files</h3>
            <p className="text-sm text-gray-400 mt-1">
              {videoCount} files loaded
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3" key={videoCount}>
            {localVideoStorage.listAssets().length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-3 bg-gray-700 rounded-lg flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">No video files</p>
                <p className="text-gray-500 text-xs mt-1">Upload videos to see them here</p>
              </div>
            ) : (
              localVideoStorage.listAssets().map((asset) => (
                <div
                  key={asset.id}
                  className={`rounded-lg p-3 transition-colors cursor-pointer ${
                    selectedVideo?.id === asset.id 
                      ? 'bg-orange-600 hover:bg-orange-700 ring-2 ring-orange-400' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                  onClick={() => handleVideoSelect(asset)}
                >
                  {/* Thumbnail */}
                  <div className="w-full h-20 bg-gray-600 rounded mb-2 overflow-hidden">
                    {asset.thumbnailUrls[0] ? (
                      <img 
                        src={asset.thumbnailUrls[0]} 
                        alt={`${asset.fileName} thumbnail`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* Filename */}
                  <div className="mb-2">
                    <p className="text-white text-sm font-medium truncate" title={asset.fileName}>
                      {asset.fileName}
                    </p>
                  </div>
                  
                  {/* Duration and Info */}
                  <div className="flex justify-between items-center text-xs text-gray-400">
                    <span className="font-mono">
                      {formatTimeWithFrames(asset.metadata.duration, asset.metadata.fps)}
                    </span>
                    <span>
                      {asset.segmentUrls.length} segments
                    </span>
                  </div>
                  
                  {/* Resolution */}
                  <div className="mt-1 text-xs text-gray-500">
                    {asset.metadata.width}×{asset.metadata.height} • {asset.metadata.fps}fps
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-black">
          {/* Dual Video Players Panel */}
          <div className="flex w-full">
            {/* Source Player Panel */}
            <div className="w-1/2 flex flex-col border-r border-gray-700">
              <div className="flex-1 bg-black relative">
                {/* Video Player */}
                <VideoPlayer
                  asset={selectedVideo}
                  currentTime={timeline.currentTime}
                  isPlaying={timeline.isPlaying}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onSeek={handleVideoSeek}
                  playerType="source"
                  className="w-full h-full"
                />
              </div>
              
              {/* Source Player Controls */}
              <div className="h-20 bg-gray-800 border-t border-gray-700 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {selectedVideo && (
                      <div className="text-xs text-orange-400 mr-2 bg-orange-900 px-2 py-1 rounded">
                        SOURCE: {selectedVideo.fileName}
                      </div>
                    )}
                    <button
                      onClick={() => seek(0)}
                      className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                      disabled={!currentProject}
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => timeline.isPlaying ? pause() : play()}
                      className="p-2 bg-orange-600 hover:bg-orange-700 rounded transition-colors disabled:opacity-50"
                      disabled={!currentProject}
                    >
                      {timeline.isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => seek(timeline.duration)}
                      className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                      disabled={!currentProject}
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>
                    
                    {/* Volume Controls */}
                    {selectedVideo && (
                      <div className="flex items-center space-x-2 ml-4">
                        <button className="p-1.5 hover:bg-gray-700 rounded transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M6 10l4-4v3h7v2H10v3l-4-4z" />
                          </svg>
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          defaultValue="1"
                          className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 text-xs text-gray-400">
                    <span className="font-mono">
                      {selectedVideo 
                        ? formatTimeWithFrames(timeline.currentTime, selectedVideo.metadata.fps)
                        : formatTime(timeline.currentTime)
                      }
                    </span>
                    <span>/</span>
                    <span className="font-mono">
                      {selectedVideo 
                        ? formatTimeWithFrames(selectedVideo.metadata.duration, selectedVideo.metadata.fps)
                        : formatTime(timeline.duration)
                      }
                    </span>
                    {selectedVideo && (
                      <span className="text-gray-500 ml-2">
                        {selectedVideo.metadata.width}×{selectedVideo.metadata.height} {selectedVideo.metadata.fps}fps
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="mt-2">
                  <div 
                    className="relative w-full h-2 bg-gray-700 rounded-full cursor-pointer hover:h-3 transition-all"
                    onClick={handleSourceProgressClick}
                  >
                    <div 
                      className="h-full bg-orange-500 rounded-full transition-all duration-100"
                      style={{ 
                        width: selectedVideo && selectedVideo.metadata.duration > 0
                          ? `${(timeline.currentTime / selectedVideo.metadata.duration) * 100}%` 
                          : '0%' 
                      }}
                    />
                    {/* Scrubber handle */}
                    <div 
                      className="absolute top-0 w-4 h-2 bg-orange-300 rounded-full transform -translate-x-1/2 cursor-grab active:cursor-grabbing hover:w-5 hover:h-3 transition-all"
                      style={{ 
                        left: selectedVideo && selectedVideo.metadata.duration > 0
                          ? `${(timeline.currentTime / selectedVideo.metadata.duration) * 100}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Program Player Panel */}
            <div className="w-1/2 flex flex-col">
              <div className="flex-1 bg-black relative">
                {/* Program Video Player - Currently shows timeline output */}
                <VideoPlayer
                  asset={null} // TODO: Will show timeline composition in Phase 3
                  currentTime={timeline.currentTime}
                  isPlaying={timeline.isPlaying}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onSeek={handleVideoSeek}
                  playerType="program"
                  className="w-full h-full"
                />
              </div>
              
              {/* Program Player Controls */}
              <div className="h-20 bg-gray-800 border-t border-gray-700 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => seek(0)}
                      className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                      disabled={!currentProject}
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => timeline.isPlaying ? pause() : play()}
                      className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                      disabled={!currentProject}
                    >
                      {timeline.isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => seek(timeline.duration)}
                      className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                      disabled={!currentProject}
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center space-x-2 text-xs text-gray-400">
                    <span className="font-mono">
                      {formatTime(timeline.currentTime)}
                    </span>
                    <span>/</span>
                    <span className="font-mono">
                      {formatTime(timeline.duration)}
                    </span>
                    <span className="text-gray-500 ml-2">
                      PROGRAM OUTPUT
                    </span>
                  </div>
                </div>
                
                <div className="mt-2">
                  <div 
                    className="relative w-full h-2 bg-gray-700 rounded-full cursor-pointer hover:h-3 transition-all"
                    onClick={handleProgramProgressClick}
                  >
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-100"
                      style={{ 
                        width: timeline.duration > 0 
                          ? `${(timeline.currentTime / timeline.duration) * 100}%` 
                          : '0%' 
                      }}
                    />
                    {/* Scrubber handle */}
                    <div 
                      className="absolute top-0 w-4 h-2 bg-blue-300 rounded-full transform -translate-x-1/2 cursor-grab active:cursor-grabbing hover:w-5 hover:h-3 transition-all"
                      style={{ 
                        left: timeline.duration > 0 
                          ? `${(timeline.currentTime / timeline.duration) * 100}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Panel */}
          <div className="flex-1 bg-gray-900 border-t border-gray-700 relative">
            <div className="absolute inset-0 flex">
              {/* Timeline Component Area */}
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-full max-w-4xl h-48 bg-gray-800 rounded-lg flex items-center justify-center mb-4">
                    <div className="text-gray-600 space-y-2">
                      <div className="h-6 w-full bg-gray-700 rounded"></div>
                      <div className="h-6 w-full bg-gray-700 rounded"></div>
                      <div className="h-6 w-full bg-gray-700 rounded"></div>
                      <div className="h-6 w-full bg-gray-700 rounded"></div>
                      <div className="h-6 w-full bg-gray-700 rounded"></div>
                    </div>
                  </div>
                  <p className="text-gray-400">Timeline</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Multi-track timeline will be implemented in Phase 3
                  </p>
                </div>
              </div>
              
              {/* Audio Level Meter */}
              <div className="w-24 bg-gray-800 border-l border-gray-700 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-32 bg-gray-700 rounded-sm mb-2"></div>
                  <p className="text-xs text-gray-500">Audio</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-72 bg-gray-800 border-l border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Project Info</h3>
            
            {currentProject ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Title</label>
                  <p className="text-white">{currentProject.title}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Duration</label>
                  <p className="text-white">{formatTime(currentProject.duration)}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Resolution</label>
                  <p className="text-white">
                    {currentProject.resolution.width} × {currentProject.resolution.height}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Frame Rate</label>
                  <p className="text-white">{currentProject.fps} fps</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Tracks</label>
                  <p className="text-white">{currentProject.tracks.length} tracks</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">No project loaded</p>
            )}

            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Development Progress</h3>
              <div className="space-y-2">
                {/* Phase 1 - Complete */}
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Phase 1: Upload & Processing ✓</span>
                </div>
                
                {/* Phase 2 - In Progress */}
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm">Phase 2: Video Player (Current)</span>
                </div>
                <div className="ml-6 space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-xs text-gray-300">Video Player Component ✓</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-xs text-gray-300">File Selection ✓</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span className="text-xs text-gray-300">HLS Playback (Next)</span>
                  </div>
                </div>
                
                {/* Phase 3 - Pending */}
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                  <span className="text-sm">Phase 3: Timeline</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                  <span className="text-sm">Phase 4: Export</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}