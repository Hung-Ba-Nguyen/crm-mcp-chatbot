import { Routes } from '@angular/router';
import { TaskChatComponent } from './task-chat/task-chat.component';
import { authGuard } from './auth.guard';
import { LoginComponent } from './login/login.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: TaskChatComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
