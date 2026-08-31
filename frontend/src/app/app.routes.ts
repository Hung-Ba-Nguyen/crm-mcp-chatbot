import { Routes } from '@angular/router';
import { TaskChatComponent } from './task-chat/task-chat.component';
import { authGuard } from './auth.guard';
import { LoginComponent } from './login/login.component';
import { CreateTaskComponent } from './components/create-task/create-task.component';
import { WorkloadDashboardComponent } from './components/workload-dashboard/workload-dashboard.component';
import { UpdateTaskStatusComponent } from './components/update-task-status/update-task-status.component';
import { KanbanBoardComponent } from './components/kanban-board/kanban-board.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'create-task', component: CreateTaskComponent, canActivate: [authGuard] },
  { path: 'dashboard', component: WorkloadDashboardComponent, canActivate: [authGuard] },
  { path: 'kanban', component: KanbanBoardComponent, canActivate: [authGuard] },
  { path: 'update-status', component: UpdateTaskStatusComponent, canActivate: [authGuard] },
  { path: '', component: TaskChatComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
