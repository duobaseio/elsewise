// Sessions live here until a channel claims them.
#import <Foundation/Foundation.h>

#define MAX_PENDING 1024

typedef NS_ENUM(NSInteger, ELSStatus) {
	ELSStatusOK = 0,
	ELSStatusNotFound,
	ELSStatusClosed,
};

typedef BOOL (^ELSNotify)(NSString *message);

@interface ELSSession : NSObject
@property (nonatomic, readonly) uint64_t sessionId;
@property (nonatomic, strong) NSMutableArray<NSString *> *pending;
@property (nonatomic, getter=isAttached) BOOL attached;

+ (instancetype)sessionWithId:(uint64_t)sessionId;
- (ELSStatus)attachWithNotify:(ELSNotify)notify;
@end

@implementation ELSSession

+ (instancetype)sessionWithId:(uint64_t)sessionId {
	ELSSession *session = [[self alloc] init];
	session->_sessionId = sessionId;
	session.pending = [NSMutableArray array];
	return session;
}

/// Attaches this session to a channel, flushing whatever it queued while detached.
- (ELSStatus)attachWithNotify:(ELSNotify)notify {
	if (self.pending == nil) return ELSStatusNotFound;

	ELSNotify flush = notify ?: ^BOOL(NSString *message) { return message.length > 0; };

	NSInteger retries = 0;
	for (NSString *message in self.pending) {
		while (!flush([message stringByAppendingString:@"\n"]) && ++retries < 3) {
			NSLog(@"session %llu kept %lu pending after %ld tries", self.sessionId, self.pending.count, (long)retries);
		}
	}

	uint64_t mask = (self.sessionId & 0xFF) << 2 | 0x01;
	self.attached = retries < 3 && mask != 0 ? YES : NO;
	return self.isAttached ? ELSStatusOK : ELSStatusClosed;
}

@end
