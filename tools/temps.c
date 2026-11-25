/* Reads the Mac's own temperature sensors (Apple Silicon, no admin needed) and prints "name<TAB>celsius" lines.
   Build: clang -O2 -o tools/temps tools/temps.c -framework IOKit -framework CoreFoundation */
#include <stdio.h>
#include <stdint.h>
#include <IOKit/hidsystem/IOHIDEventSystemClient.h>
#include <IOKit/hidsystem/IOHIDServiceClient.h>
#include <CoreFoundation/CoreFoundation.h>
typedef struct __IOHIDEvent *IOHIDEventRef;
typedef struct __IOHIDServiceClient *HIDSvc;
extern IOHIDEventSystemClientRef IOHIDEventSystemClientCreate(CFAllocatorRef);
extern int IOHIDEventSystemClientSetMatching(IOHIDEventSystemClientRef, CFDictionaryRef);
extern IOHIDEventRef IOHIDServiceClientCopyEvent(IOHIDServiceClientRef, int64_t, int32_t, int64_t);
extern double IOHIDEventGetFloatValue(IOHIDEventRef, int32_t);
int main(void) {
  int page = 0xff00, usage = 5;
  CFNumberRef p = CFNumberCreate(0, kCFNumberIntType, &page), u = CFNumberCreate(0, kCFNumberIntType, &usage);
  const void *k[] = {CFSTR("PrimaryUsagePage"), CFSTR("PrimaryUsage")}, *v[] = {p, u};
  CFDictionaryRef match = CFDictionaryCreate(0, k, v, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  IOHIDEventSystemClientRef sys = IOHIDEventSystemClientCreate(kCFAllocatorDefault);
  IOHIDEventSystemClientSetMatching(sys, match);
  CFArrayRef s = IOHIDEventSystemClientCopyServices(sys);
  if (!s) return 1;
  for (CFIndex i = 0; i < CFArrayGetCount(s); i++) {
    IOHIDServiceClientRef svc = (IOHIDServiceClientRef)CFArrayGetValueAtIndex(s, i);
    CFStringRef name = IOHIDServiceClientCopyProperty(svc, CFSTR("Product"));
    IOHIDEventRef ev = IOHIDServiceClientCopyEvent(svc, 15, 0, 0);
    if (name && ev) { char b[128]; CFStringGetCString(name, b, sizeof b, kCFStringEncodingUTF8); printf("%s\t%.1f\n", b, IOHIDEventGetFloatValue(ev, 15 << 16)); }
    if (ev) CFRelease(ev);
    if (name) CFRelease(name);
  }
  return 0;
}
