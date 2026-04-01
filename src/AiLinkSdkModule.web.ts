import { registerWebModule, NativeModule } from 'expo';

import { AiLinkSdkModuleEvents } from './AiLinkSdk.types';

class AiLinkSdkModule extends NativeModule<AiLinkSdkModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(AiLinkSdkModule, 'AiLinkSdkModule');
