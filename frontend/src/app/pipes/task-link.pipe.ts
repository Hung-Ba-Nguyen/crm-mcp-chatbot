import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'taskLink', standalone: true })
export class TaskLinkPipe implements PipeTransform {
  /**
   * Transform text containing [Task CV01] or [CV01] into clickable HTML links.
   * Example: "See [Task CV01]" -> "See <a href=\"/tasks/CV01\" data-task-id=\"CV01\">Task CV01</a>"
   */
  transform(value: string | null | undefined): string {
    if (!value) return '';

    const regex = /\[\s*(?:Task\s*)?([A-Z0-9\-]+)\s*\]/gi;

    return value.replace(regex, (_match: string, taskId: string) => {
      const normalized = taskId.toUpperCase();
      const display = `Task ${normalized}`;
      // Render anchor with href for deep linking and a data attribute so the app can intercept navigation
      return `<a href="/tasks/${encodeURIComponent(normalized)}" data-task-id="${encodeURIComponent(normalized)}">${display}</a>`;
    });
  }
}

export default TaskLinkPipe;
