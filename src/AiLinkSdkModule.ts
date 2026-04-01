import { NativeModule, requireNativeModule } from 'expo';

import { AiLinkSdkModuleEvents } from './AiLinkSdk.types';

declare class AiLinkSdkModule extends NativeModule<AiLinkSdkModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<AiLinkSdkModule>('AiLinkSdk');
