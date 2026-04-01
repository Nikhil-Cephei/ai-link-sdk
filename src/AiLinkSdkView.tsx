import { requireNativeView } from 'expo';
import * as React from 'react';

import { AiLinkSdkViewProps } from './AiLinkSdk.types';

const NativeView: React.ComponentType<AiLinkSdkViewProps> =
  requireNativeView('AiLinkSdk');

export default function AiLinkSdkView(props: AiLinkSdkViewProps) {
  return <NativeView {...props} />;
}
