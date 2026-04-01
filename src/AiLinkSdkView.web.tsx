import * as React from 'react';

import { AiLinkSdkViewProps } from './AiLinkSdk.types';

export default function AiLinkSdkView(props: AiLinkSdkViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
