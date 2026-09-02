import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import * as XLSX from 'xlsx-js-style';
import Swal from 'sweetalert2';

interface OptionItem {
  id: string;
  name: string;
}

interface WorkloadStatRow {
  userId: string;
  userName: string;
  total: number;
  completed: number;
  inProgress: number;
  pendingApproval: number;
  overdue: number;
  completionRate: number;
}

@Component({
  selector: 'app-workload-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workload-dashboard.component.html',
  styleUrls: ['./workload-dashboard.component.scss']
})
export class WorkloadDashboardComponent implements OnInit {
  private http = inject(HttpClient);

  queryType: 'department' | 'user' = 'department';
  selectedId: string = '';
  isLoading = signal(false);
  hasData = signal(false);

  departments: OptionItem[] = [
    { id: '6a709be6af0d8b17ec325927', name: 'Phòng Phát Triển Phần Mềm (DEV)' },
    { id: '6a709be6af0d8b17ec325928', name: 'Phòng Nhân Sự (HR)' }
  ];

  users: OptionItem[] = [
    { id: '6a798756195040ed1af9cf22', name: 'Lê Văn Kiểm Thử' },
    { id: '6a798756195040ed1af9cf20', name: 'Nguyễn Văn Quản Lý' },
    { id: '6a798756195040ed1af9cf21', name: 'Trần Thị Lập Trình' }
  ];

  private userMap: Record<string, string> = {
    '6a798756195040ed1af9cf22': 'Lê Văn Kiểm Thử',
    '6a798756195040ed1af9cf20': 'Nguyễn Văn Quản Lý',
    '6a798756195040ed1af9cf21': 'Trần Thị Lập Trình'
  };

  stats = signal({
    total: 0,
    completed: 0,
    inProgress: 0,
    pendingApproval: 0,
    overdue: 0
  });

  globalCompletionRate = signal(0);
  overdueTasks = signal<any[]>([]);
  workloadSummary = signal<WorkloadStatRow[]>([]);

  ngOnInit(): void {
    this.fetchUsersFromApi();
    this.selectedId = '';
    this.hasData.set(false);
  }

  onQueryTypeChange(): void {
    this.selectedId = '';
    this.hasData.set(false);
    this.resetStats();
  }

  onSelectChange(): void {
    if (this.selectedId) {
      this.loadDashboardData();
    }
  }

  private resetStats(): void {
    this.stats.set({ total: 0, completed: 0, inProgress: 0, pendingApproval: 0, overdue: 0 });
    this.globalCompletionRate.set(0);
    this.overdueTasks.set([]);
    this.workloadSummary.set([]);
  }

  private fetchUsersFromApi(): void {
    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Users`;
    this.http.get<any[]>(url).subscribe({
      next: (res) => {
        if (Array.isArray(res) && res.length > 0) {
          const apiUsers = res.map(u => ({
            id: String(u.id || u.Id || u._id || ''),
            name: String(u.fullName || u.FullName || u.userName || u.UserName || u.name || 'User')
          })).filter(u => u.id);

          if (apiUsers.length > 0) {
            this.users = apiUsers;
            apiUsers.forEach(u => this.userMap[u.id] = u.name);
          }
        }
      },
      error: () => { }
    });
  }

  getUserDisplayName(userId?: string): string {
    const uid = String(userId || '').trim();
    if (!uid) return 'Chưa phân công';
    return this.userMap[uid] || (uid.length > 8 ? `Nhân sự (${uid.slice(0, 6)})` : uid);
  }

  loadDashboardData(): void {
    if (!this.selectedId) return;

    this.isLoading.set(true);
    const baseUrl = environment.apiUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/Tasks`;

    this.http.get<any[]>(url).subscribe({
      next: (res) => {
        let tasks: any[] = [];
        if (Array.isArray(res)) tasks = res;
        else if (Array.isArray((res as any)?.tasks)) tasks = (res as any).tasks;

        const targetId = this.selectedId.trim();
        const filtered = tasks.filter(t => {
          if (this.queryType === 'department') {
            const deptId = String(t.departmentId || t.DepartmentId || '').trim();
            return deptId === targetId;
          } else {
            const assigneeId = String(t.assigneeId || t.AssigneeId || '').trim();
            return assigneeId === targetId;
          }
        });

        this.calculateDashboardStats(filtered);
        this.hasData.set(true);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        Swal.fire({
          icon: 'error',
          title: 'Lỗi tải dữ liệu',
          text: 'Không thể tải dữ liệu thống kê từ máy chủ.'
        });
      }
    });
  }

  private calculateDashboardStats(tasks: any[]): void {
    const now = new Date();
    let total = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let pendingApproval = 0;
    let overdue = 0;
    const overdues: any[] = [];
    const userGroups: Record<string, { total: number; completed: number; inProgress: number; pendingApproval: number; overdue: number }> = {};

    tasks.forEach(t => {
      const status = String(t.status ?? t.Status ?? 0).toLowerCase();
      const isDone = status === '2' || status === 'completed' || status === 'done';
      const isInProg = status === '1' || status === 'inprogress';
      const isPending = status === '4' || status === 'pendingapproval';

      const dueDateStr = t.dueDate || t.DueDate;
      let isOver = false;
      if (dueDateStr && !isDone) {
        const d = new Date(dueDateStr);
        d.setHours(23, 59, 59, 999);
        if (d < now) {
          isOver = true;
        }
      }

      if (isDone) completed++;
      if (isInProg) inProgress++;
      if (isPending) pendingApproval++;
      if (isOver) {
        overdue++;
        overdues.push({
          id: t.id || t.Id || t._id,
          title: t.title || t.Title,
          assigneeId: t.assigneeId || t.AssigneeId,
          dueDate: dueDateStr,
          priority: t.priority || t.Priority || 'Medium'
        });
      }

      const uId = String(t.assigneeId || t.AssigneeId || 'unassigned').trim();
      if (!userGroups[uId]) {
        userGroups[uId] = { total: 0, completed: 0, inProgress: 0, pendingApproval: 0, overdue: 0 };
      }
      userGroups[uId].total++;
      if (isDone) userGroups[uId].completed++;
      if (isInProg) userGroups[uId].inProgress++;
      if (isPending) userGroups[uId].pendingApproval++;
      if (isOver) userGroups[uId].overdue++;
    });

    const globalRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    this.globalCompletionRate.set(globalRate);

    this.stats.set({ total, completed, inProgress, pendingApproval, overdue });
    this.overdueTasks.set(overdues);

    const summaryRows: WorkloadStatRow[] = Object.keys(userGroups).map(uId => {
      const g = userGroups[uId];
      const rate = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0;
      return {
        userId: uId,
        userName: this.getUserDisplayName(uId),
        total: g.total,
        completed: g.completed,
        inProgress: g.inProgress,
        pendingApproval: g.pendingApproval,
        overdue: g.overdue,
        completionRate: rate
      };
    });

    this.workloadSummary.set(summaryRows);
  }

  // ==================== XUẤT EXCEL CHUYÊN NGHIỆP CĂN GIỮA TIÊU ĐỀ ====================
  exportToExcel(): void {
    if (this.stats().total === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Chưa có dữ liệu',
        text: 'Vui lòng chọn đối tượng có công việc để xuất báo cáo.'
      });
      return;
    }

    const currentTargetName = this.queryType === 'department'
      ? (this.departments.find(d => d.id === this.selectedId)?.name || 'Phòng Ban')
      : (this.users.find(u => u.id === this.selectedId)?.name || 'Nhân Sự');

    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN');

    // Mảng 2D cho dữ liệu
    const sheetData: any[][] = [];

    // Hàng 0 (A1:F1): Tiêu đề chính
    sheetData.push(['BÁO CÁO TIẾN ĐỘ VÀ CHỈ SỐ KPI', '', '', '', '', '']);

    // Hàng 1 (A2:F2): Thông tin đối tượng và ngày xuất
    sheetData.push([`Đối tượng: ${currentTargetName}`, '', '', `Ngày trích xuất: ${dateStr}`, '', '']);

    // Hàng 2: Trống tạo khoảng cách
    sheetData.push([]);

    // Hàng 3 (A4): Section I
    sheetData.push(['I. TỔNG HỢP CHỈ SỐ']);

    // Hàng 4 (A5:F5): Table 1 Header
    sheetData.push(['Tổng task', 'Hoàn thành', 'Đang thực hiện', 'Chờ duyệt', 'Quá hạn', 'Tỷ lệ hoàn thành']);

    // Hàng 5 (A6:F6): Table 1 Data
    sheetData.push([
      this.stats().total,
      this.stats().completed,
      this.stats().inProgress,
      this.stats().pendingApproval,
      this.stats().overdue,
      `${this.globalCompletionRate()}%`
    ]);

    // Hàng 6: Trống
    sheetData.push([]);

    // Hàng 7 (A8): Section II
    sheetData.push(['II. TIẾN ĐỘ THEO NHÂN SỰ']);

    // Hàng 8 (A9:F9): Table 2 Header
    sheetData.push(['Nhân sự', 'Tổng Task', 'Hoàn thành', 'Đang làm', 'Chờ duyệt', 'Quá hạn', 'Tỷ lệ']);

    // Table 2 Data
    this.workloadSummary().forEach(row => {
      sheetData.push([
        row.userName,
        row.total,
        row.completed,
        row.inProgress,
        row.pendingApproval,
        row.overdue,
        `${row.completionRate}%`
      ]);
    });

    // Khoảng trống
    sheetData.push([]);

    // Section III: Quá hạn
    sheetData.push(['III. DANH SÁCH CÔNG VIỆC QUÁ HẠN']);
    sheetData.push(['Tiêu đề Task', 'Người phụ trách', 'Hạn hoàn thành', 'Mức ưu tiên']);

    if (this.overdueTasks().length > 0) {
      this.overdueTasks().forEach(t => {
        const d = t.dueDate ? new Date(t.dueDate).toLocaleDateString('vi-VN') : 'Không xác định';
        const p = t.priority === 'High' ? 'Cao' : (t.priority === 'Low' ? 'Thấp' : 'Trung bình');
        sheetData.push([t.title, this.getUserDisplayName(t.assigneeId), d, p]);
      });
    } else {
      sheetData.push(['Không có công việc nào bị quá hạn', '', '', '']);
    }

    const worksheet: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Merge Cells:
    // A1:F1: Tiêu đề báo cáo (Merge toàn bộ 6 cột)
    // A2:C2: Đối tượng báo cáo
    // D2:F2: Ngày trích xuất
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // A1:F1
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }, // A2:C2
      { s: { r: 1, c: 3 }, e: { r: 1, c: 5 } }  // D2:F2
    ];

    // Cấu hình chiều cao từng hàng (Row Heights)
    worksheet['!rows'] = [
      { hpt: 30 }, // Hàng 1 (Tiêu đề lớn): 30pt thoáng đãng
      { hpt: 20 }, // Hàng 2 (Subtitle): 20pt
      { hpt: 10 }, // Hàng 3 (Khoảng trống)
      { hpt: 22 }, // Hàng 4 (Section I title)
      { hpt: 24 }  // Hàng 5 (Header bảng)
    ];

    // Độ rộng các cột
    worksheet['!cols'] = [
      { wch: 30 }, // A: Tiêu đề Task / Nhân sự
      { wch: 18 }, // B: Người phụ trách / Tổng Task
      { wch: 18 }, // C: Hạn hoàn thành / Hoàn thành
      { wch: 18 }, // D: Mức ưu tiên / Đang làm
      { wch: 16 }, // E: Quá hạn
      { wch: 20 }  // F: Tỷ lệ hoàn thành
    ];

    // ==================== ĐỊNH NGHĨA STYLES ====================
    const thinBorder = {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } }
    };

    const headerTableStyle = {
      fill: { fgColor: { rgb: '4F46E5' } },
      font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder
    };

    const centerNumStyle = {
      font: { name: 'Segoe UI', sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder
    };

    const textLeftStyle = {
      font: { name: 'Segoe UI', sz: 10, bold: true },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder
    };

    const completedStyle = {
      font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: '16A34A' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder
    };

    const overdueStyle = {
      font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'DC2626' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder
    };

    const inProgressStyle = {
      font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'D97706' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder
    };

    const pendingStyle = {
      font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: '7C3AED' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder
    };

    // ÁP DỤNG STYLE CĂN GIỮA CHO TIÊU ĐỀ LỚN A1
    if (worksheet['A1']) {
      worksheet['A1'].s = {
        font: { name: 'Segoe UI', sz: 16, bold: true, color: { rgb: '3730A3' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
    }

    // Dòng thông tin phụ A2 và D2
    if (worksheet['A2']) {
      worksheet['A2'].s = {
        font: { name: 'Segoe UI', sz: 10, italic: true, color: { rgb: '475569' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      };
    }
    if (worksheet['D2']) {
      worksheet['D2'].s = {
        font: { name: 'Segoe UI', sz: 10, italic: true, color: { rgb: '475569' } },
        alignment: { horizontal: 'right', vertical: 'center' }
      };
    }

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:F30');

    for (let R = range.s.r; R <= range.e.r; ++R) {
      const firstCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 0 })]?.v;

      // Tiêu đề đề mục (I., II., III.)
      if (typeof firstCell === 'string' && (firstCell.startsWith('I.') || firstCell.startsWith('II.') || firstCell.startsWith('III.'))) {
        worksheet[XLSX.utils.encode_cell({ r: R, c: 0 })].s = {
          font: { name: 'Segoe UI', sz: 11, bold: true, color: { rgb: '0F172A' } },
          alignment: { vertical: 'center' }
        };
        continue;
      }

      // Headers của các bảng (Tím Indigo căn giữa)
      if (firstCell === 'Tổng task' || firstCell === 'Nhân sự' || firstCell === 'Tiêu đề Task') {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (worksheet[cellRef]) {
            worksheet[cellRef].s = headerTableStyle;
          }
        }
        continue;
      }

      // Dữ liệu dòng KPI Tổng hợp (Row 5 - tức dòng 6 trên Excel)
      if (R === 5) {
        worksheet['A6'].s = centerNumStyle;
        worksheet['B6'].s = completedStyle;
        worksheet['C6'].s = inProgressStyle;
        worksheet['D6'].s = pendingStyle;
        worksheet['E6'].s = overdueStyle;
        worksheet['F6'].s = centerNumStyle;
        continue;
      }

      // Dữ liệu bảng Nhân sự (Section II)
      const isUserRow = this.workloadSummary().some(w => w.userName === firstCell);
      if (isUserRow) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!worksheet[cellRef]) continue;

          if (C === 0) worksheet[cellRef].s = textLeftStyle;
          else if (C === 2) worksheet[cellRef].s = completedStyle;
          else if (C === 3) worksheet[cellRef].s = inProgressStyle;
          else if (C === 4) worksheet[cellRef].s = pendingStyle;
          else if (C === 5) worksheet[cellRef].s = overdueStyle;
          else worksheet[cellRef].s = centerNumStyle;
        }
        continue;
      }

      // Dữ liệu bảng Task quá hạn (Section III)
      if (R > 8 && firstCell && firstCell !== 'Không có công việc nào bị quá hạn') {
        for (let C = 0; C <= 3; ++C) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!worksheet[cellRef]) continue;

          if (C === 0) worksheet[cellRef].s = textLeftStyle;
          else if (C === 1) worksheet[cellRef].s = textLeftStyle;
          else if (C === 2) worksheet[cellRef].s = overdueStyle;
          else worksheet[cellRef].s = centerNumStyle;
        }
      }
    }

    const workbook: XLSX.WorkBook = {
      Sheets: { 'Báo cáo tiến độ': worksheet },
      SheetNames: ['Báo cáo tiến độ']
    };

    const fileName = `BaoCao_KPI_${now.getTime()}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    Swal.fire({
      icon: 'success',
      title: 'Xuất file thành công',
      text: `File ${fileName} đã sẵn sàng với tiêu đề căn giữa hoàn hảo!`,
      timer: 1600,
      showConfirmButton: false
    });
  }
}
