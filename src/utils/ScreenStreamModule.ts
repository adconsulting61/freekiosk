import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { ScreenStreamModule: Native } = NativeModules;

export type StreamStatus = 'connected' | 'disconnected' | 'stopped';

const emitter = Native ? new NativeEventEmitter(Native) : null;

export interface StartStreamingOptions {
  relayUrl: string;
  deviceId: string;
  quality?: number; // JPEG quality 10-90, default 40
  fps?: number;     // frames per second 1-10, default 2
}

const ScreenStreamModule = {
  async startStreaming(opts: StartStreamingOptions): Promise<boolean> {
    if (Platform.OS !== 'android' || !Native) return false;
    return Native.startStreaming(
      opts.relayUrl,
      opts.deviceId,
      opts.quality ?? 40,
      opts.fps ?? 2
    );
  },

  async stopStreaming(): Promise<boolean> {
    if (Platform.OS !== 'android' || !Native) return false;
    return Native.stopStreaming();
  },

  async isStreaming(): Promise<boolean> {
    if (Platform.OS !== 'android' || !Native) return false;
    return Native.isStreaming();
  },

  onStatusChange(callback: (status: StreamStatus) => void) {
    if (!emitter) return { remove: () => {} };
    return emitter.addListener('screenStreamStatus', callback);
  },
};

export default ScreenStreamModule;
