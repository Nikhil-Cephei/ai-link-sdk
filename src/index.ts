// Reexport the native module. On web, it will be resolved to AiLinkSdkModule.web.ts
// and on native platforms to AiLinkSdkModule.ts
export { default } from './AiLinkSdkModule';
export { default as AiLinkSdkView } from './AiLinkSdkView';
export * from  './AiLinkSdk.types';
