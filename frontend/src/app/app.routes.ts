import { Routes } from '@angular/router';
import { TaskChatComponent } from './task-chat/task-chat.component';

export const routes: Routes = [
  { path: '', component: TaskChatComponent },
  { path: '**', redirectTo: '' },
];
