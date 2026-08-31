import { inject, signal } from '@angular/core';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  showPassword = signal(false);
  loading = signal(false);
  serverError = signal('');

  // ==========================================
  // THÊM BIẾN VÀ HÀM CHUYỂN NGÔN NGỮ Ở ĐÂY
  // ==========================================
  activeLang: 'vi' | 'en' = 'en';
  // Tạo bộ từ điển chứa text của 2 ngôn ngữ
translations = {
  vi: {
    welcome: 'Chào mừng trở lại',
    subtitle: 'Vui lòng nhập thông tin để đăng nhập.',
    emailLabel: 'Email',
    emailPlaceholder: 'ban@congty.com',
    passLabel: 'Mật khẩu',
    passPlaceholder: 'Nhập mật khẩu của bạn',
    remember: 'Ghi nhớ đăng nhập',
    forgot: 'Quên mật khẩu?',
    signIn: 'Đăng Nhập',
    noAccount: 'Chưa có tài khoản?',
    request: 'Yêu cầu cấp quyền'
  },
  en: {
    welcome: 'Welcome back',
    subtitle: 'Please enter your details to sign in.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@company.com',
    passLabel: 'Password',
    passPlaceholder: 'Enter your password',
    remember: 'Remember me',
    forgot: 'Forgot password?',
    signIn: 'Sign In',
    noAccount: 'Don\'t have an account?',
    request: 'Request access'
  }
};

// Tạo một getter để HTML gọi data ngắn gọn hơn
get t() {
  return this.translations[this.activeLang];
}

  setLang(lang: 'vi' | 'en') {
    this.activeLang = lang;
    console.log('Ngôn ngữ hiện tại:', this.activeLang);
  }
  // ==========================================

  form = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
    remember: [false]
  });

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    this.serverError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value as { username: string | null; password: string | null; remember: boolean };
    this.loading.set(true);

    // Measure API latency from frontend
    console.time('API_Login');
    this.auth.login({ email: val.username ?? '', password: val.password ?? '' }).subscribe({
      next: async () => {
        // End frontend timer as soon as response arrives
        console.timeEnd('API_Login');
        this.loading.set(false);
        // Token is written to localStorage synchronously inside AuthService.map()
        // Navigate immediately after successful login
        await this.router.navigate(['/']);
      },
      error: (err: any) => {
        // End frontend timer on error as well
        console.timeEnd('API_Login');
        this.loading.set(false);
        this.serverError.set(err?.error?.message || 'Invalid username or password.');
      }
    });
  }
}
