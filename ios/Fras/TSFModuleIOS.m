#import <Foundation/Foundation.h>
#import "React/RCTBridgeModule.h"
@interface RCT_EXTERN_MODULE(TSFModuleIOS, NSObject)
  RCT_EXTERN_METHOD(isModelLoaded:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

  RCT_EXTERN_METHOD(getFaceEmbedding:(NSString *)base64String
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
