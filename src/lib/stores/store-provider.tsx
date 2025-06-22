'use client';

import { createContext, useContext, useRef } from 'react';
import { useStore } from 'zustand';
import { createVideoEditorStore, type VideoEditorStore } from './video-editor-store';

export type VideoEditorStoreApi = ReturnType<typeof createVideoEditorStore>;

export const VideoEditorStoreContext = createContext<VideoEditorStoreApi | undefined>(
  undefined,
);

export interface VideoEditorStoreProviderProps {
  children: React.ReactNode;
}

export const VideoEditorStoreProvider = ({
  children,
}: VideoEditorStoreProviderProps) => {
  const storeRef = useRef<VideoEditorStoreApi>();
  if (!storeRef.current) {
    storeRef.current = createVideoEditorStore();
  }

  return (
    <VideoEditorStoreContext.Provider value={storeRef.current}>
      {children}
    </VideoEditorStoreContext.Provider>
  );
};

export const useVideoEditorStoreContext = <T,>(
  selector: (store: VideoEditorStore) => T,
): T => {
  const videoEditorStoreContext = useContext(VideoEditorStoreContext);

  if (!videoEditorStoreContext) {
    throw new Error(`useVideoEditorStoreContext must be used within VideoEditorStoreProvider`);
  }

  return useStore(videoEditorStoreContext, selector);
};