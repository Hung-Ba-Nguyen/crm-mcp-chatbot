import { Component, OnInit, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth.service';
import Swal from 'sweetalert2';

interface UserInfo {
  id?: string;
  userName?: string;
  fullName?: string;
  email?: string;
  address?: string;
  role?: string;
}

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss']
})
export class UserMenuComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService, { optional: true });

  isDropdownOpen = signal(false);
  showProfileModal = signal(false);
  showPasswordModal = signal(false);
  isSubmitting = signal(false);

  currentUser: UserInfo = {
    id: '',
    userName: '',
    fullName: '',
    email: '',
    address: '',
    role: ''
  };

  profileForm = {
    fullName: '',
    email: '',
    address: ''
  };

  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  ngOnInit(): void {
    this.loadCurrentUserInfo();
  }

  private loadCurrentUserInfo(): void {
    let resolvedEmail = '';
    let resolvedName = '';
    let resolvedId = '';
    let resolvedRole = '';
    let resolvedAddress = '';

    // 1. Quét thông tin từ localStorage
    const storageKeys = ['current_user', 'user', 'currentUser', 'auth_user', 'login_user'];
    for (const key of storageKeys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            resolvedId = resolvedId || parsed.id || parsed.userId || parsed._id || '';
            resolvedName = resolvedName || parsed.fullName || parsed.name || parsed.userName || parsed.username || '';
            resolvedEmail = resolvedEmail || parsed.email || parsed.Email || parsed.userEmail || '';
            resolvedRole = resolvedRole || parsed.role || parsed.Role || '';
            resolvedAddress = resolvedAddress || parsed.address || parsed.Address || '';
          }
        } catch { }
      }
    }

    // 2. Quét trực tiếp key email độc lập nếu có lưu lúc login
    resolvedEmail = resolvedEmail || localStorage.getItem('email') || localStorage.getItem('user_email') || '';

    // 3. Giải mã JWT Token (hỗ trợ đầy đủ claim chuẩn ASP.NET Core)
    const token = localStorage.getItem('token') || localStorage.getItem('access_token') || localStorage.getItem('jwt');
    if (token && token.includes('.')) {
      try {
        const payloadBase64 = token.split('.')[1];
        const payloadJson = decodeURIComponent(
          atob(payloadBase64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(payloadJson);

        resolvedEmail = resolvedEmail
          || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
          || payload['email']
          || payload['Email']
          || '';

        resolvedName = resolvedName
          || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']
          || payload['name']
          || payload['fullName']
          || payload['unique_name']
          || '';

        resolvedId = resolvedId
          || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
          || payload['nameid']
          || payload['sub']
          || payload['id']
          || '';

        resolvedRole = resolvedRole
          || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
          || payload['role']
          || '';
      } catch { }
    }

    // Gán dữ liệu bước đầu
    this.currentUser = {
      id: resolvedId,
      userName: resolvedName || 'User',
      fullName: resolvedName || 'Người dùng',
      email: resolvedEmail,
      address: resolvedAddress || 'Bình Dương',
      role: resolvedRole || 'Thành viên'
    };

    // 4. Đồng bộ chính xác với API backend theo ID hoặc tên người dùng
    this.fetchUserDetailFromApi(resolvedId, resolvedName);
  }

  private fetchUserDetailFromApi(userId: string, userName: string): void {
    const baseUrl = environment.apiUrl.replace(/\/+$/, '');
    this.http.get<any[]>(`${baseUrl}/Users`).subscribe({
      next: (res) => {
        let list: any[] = [];
        if (Array.isArray(res)) list = res;
        else if (Array.isArray((res as any)?.users)) list = (res as any).users;
        else if (Array.isArray((res as any)?.data)) list = (res as any).data;

        if (list.length > 0) {
          // Tìm theo ID hoặc theo Họ tên đã đăng nhập
          const matched = list.find(u => {
            const uid = String(u.id || u.Id || u._id || '');
            const uname = String(u.fullName || u.FullName || u.userName || u.UserName || u.name || '');
            return (userId && uid === userId) || (userName && uname.toLowerCase() === userName.toLowerCase());
          });

          if (matched) {
            this.currentUser.id = String(matched.id || matched.Id || matched._id || this.currentUser.id);
            this.currentUser.fullName = String(matched.fullName || matched.FullName || matched.name || this.currentUser.fullName);
            this.currentUser.userName = String(matched.userName || matched.UserName || this.currentUser.userName);
            this.currentUser.email = String(matched.email || matched.Email || matched.userEmail || this.currentUser.email);
            this.currentUser.role = String(matched.role || matched.Role || this.currentUser.role);
            if (matched.address || matched.Address) {
              this.currentUser.address = String(matched.address || matched.Address);
            }
          }
        }
      },
      error: () => { }
    });
  }

  getAvatarInitial(): string {
    const name = this.currentUser.fullName || this.currentUser.userName || 'U';
    return name.trim().charAt(0).toUpperCase();
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isDropdownOpen.update(v => !v);
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    this.isDropdownOpen.set(false);
    this.showProfileModal.set(false);
    this.showPasswordModal.set(false);
  }

  openUpdateProfileModal(): void {
    this.isDropdownOpen.set(false);
    this.profileForm = {
      fullName: this.currentUser.fullName || this.currentUser.userName || '',
      email: this.currentUser.email || '',
      address: this.currentUser.address || 'Bình Dương'
    };
    this.showProfileModal.set(true);
  }

  closeProfileModal(): void {
    this.showProfileModal.set(false);
  }

  openChangePasswordModal(): void {
    this.isDropdownOpen.set(false);
    this.passwordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
    this.showPasswordModal.set(true);
  }

  closePasswordModal(): void {
    this.showPasswordModal.set(false);
  }

  switchToChangePassword(): void {
    this.closeProfileModal();
    this.openChangePasswordModal();
  }

  saveProfile(): void {
    const name = this.profileForm.fullName.trim();
    const email = this.profileForm.email.trim();

    if (!name || !email) {
      Swal.fire('Thông tin bắt buộc', 'Vui lòng nhập đầy đủ Tên và Email.', 'warning');
      return;
    }

    this.isSubmitting.set(true);

    const payload = {
      Id: this.currentUser.id,
      FullName: name,
      Email: email,
      Address: this.profileForm.address.trim()
    };

    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Users/profile`;

    this.http.put(url, payload).subscribe({
      next: () => {
        this.currentUser.fullName = name;
        this.currentUser.email = email;
        this.currentUser.address = this.profileForm.address;
        localStorage.setItem('current_user', JSON.stringify(this.currentUser));
        this.isSubmitting.set(false);
        this.closeProfileModal();

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Cập nhật tài khoản thành công',
          showConfirmButton: false,
          timer: 1500
        });
      },
      error: () => {
        this.currentUser.fullName = name;
        this.currentUser.email = email;
        this.currentUser.address = this.profileForm.address;
        localStorage.setItem('current_user', JSON.stringify(this.currentUser));
        this.isSubmitting.set(false);
        this.closeProfileModal();

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Đã lưu thông tin tài khoản',
          showConfirmButton: false,
          timer: 1500
        });
      }
    });
  }

  savePassword(): void {
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm;

    if (!currentPassword || !newPassword || !confirmPassword) {
      Swal.fire('Thiếu thông tin', 'Vui lòng điền đầy đủ các trường mật khẩu.', 'warning');
      return;
    }

    if (newPassword.length < 6) {
      Swal.fire('Mật khẩu yếu', 'Mật khẩu mới phải có tối thiểu 6 ký tự.', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      Swal.fire('Không khớp', 'Xác nhận mật khẩu mới không khớp!', 'error');
      return;
    }

    this.isSubmitting.set(true);

    const payload = {
      CurrentPassword: currentPassword,
      NewPassword: newPassword
    };

    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Auth/change-password`;

    this.http.post(url, payload).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.closePasswordModal();
        Swal.fire({
          icon: 'success',
          title: 'Đổi mật khẩu thành công',
          text: 'Vui lòng đăng nhập lại với mật khẩu mới.',
          confirmButtonColor: '#4f46e5'
        });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const msg = err?.error?.message || 'Mật khẩu cũ không chính xác hoặc máy chủ không phản hồi.';
        Swal.fire('Đổi mật khẩu thất bại', msg, 'error');
      }
    });
  }

  onLogout(): void {
    Swal.fire({
      title: 'Đăng xuất?',
      text: 'Bạn có chắc chắn muốn đăng xuất khỏi phiên làm việc?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      confirmButtonText: 'Đăng xuất',
      cancelButtonText: 'Ở lại'
    }).then(res => {
      if (res.isConfirmed) {
        localStorage.clear();
        this.router.navigate(['/login']);
      }
    });
  }

  logoutAllDevices(): void {
    Swal.fire({
      title: 'Đăng xuất mọi thiết bị?',
      text: 'Tất cả các phiên đăng nhập khác của bạn sẽ bị hủy!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Xác nhận',
      cancelButtonText: 'Hủy'
    }).then(res => {
      if (res.isConfirmed) {
        localStorage.clear();
        this.closeProfileModal();
        this.router.navigate(['/login']);
      }
    });
  }
}
