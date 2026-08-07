import { Directive, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';

@Directive({
  standalone: true,
  selector: '[appAutoScroll]'
})
export class AutoScrollDirective implements AfterViewInit, OnDestroy {
  private observer: MutationObserver | null = null;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    // initial scroll to bottom
    this.scrollToBottom();

    // watch for DOM changes (new messages added) and scroll
    this.observer = new MutationObserver(() => {
      this.scrollToBottom();
    });

    this.observer.observe(this.host.nativeElement, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private scrollToBottom(): void {
    try {
      const el = this.host.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch (e) {
      // swallow errors to avoid breaking UI
      // console.warn('AutoScrollDirective error:', e);
    }
  }
}

export default AutoScrollDirective;
