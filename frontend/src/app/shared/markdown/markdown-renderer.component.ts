import { Component, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

@Component({
  selector: 'app-markdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="markdown-content" [innerHTML]="html"></div>
  `
})
export class MarkdownRendererComponent implements OnChanges {
  @Input() data: string | null = '';

  public html: SafeHtml = '';

  constructor(private sanitizer: DomSanitizer) {
    // Basic marked configuration
    marked.setOptions({ gfm: true, breaks: true });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.render();
    }
  }

  private render(): void {
    const raw = this.data ?? '';
    // Convert task tokens into anchor HTML (Deep Linking)
    const withLinks = raw.replace(/\[\s*(?:Task\s*)?([A-Z0-9\-]+)\s*\]/gi, (_m: string, id: string) => {
      const normalized = id.toUpperCase();
      return `<a href="/tasks/${encodeURIComponent(normalized)}" data-task-id="${encodeURIComponent(normalized)}">Task ${normalized}</a>`;
    });

    // FIX LỖI TS2345: Ép kiểu kết quả trả về thành chuỗi (string)
    const parsed = marked.parse(withLinks || '') as string;

    // Đưa vào hàm Trust HTML của Angular
    this.html = this.sanitizer.bypassSecurityTrustHtml(parsed || '');
  }
}

export default MarkdownRendererComponent;
