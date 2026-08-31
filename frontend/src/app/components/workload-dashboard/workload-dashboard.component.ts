import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
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
  overdue: number;
  completionRate: number;
}

@Component({
  selector: 'app-workload-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workload-dashboard.component.html'
})
export class WorkloadDashboardComponent implements OnInit {
  private http = inject(HttpClient);

  queryType: 'department' | 'user' = 'department';
  selectedId: string = '';
  isLoading = signal(false);

  departments: OptionItem[] = [
    { id: '6a709be6af0d8b17ec325927', name: 'Phòng Phát Triển Phần Mềm (DEV)' },
    { id: '6a709be6af0d8b17ec325928', name: 'Phòng Nhân Sự (HR)' }
  ];

  users: OptionItem[] = [
    { id: '64b8d5f1e1a3f5a0c2d9b7a1', name: 'Nguyễn Bá Hùng (Dev Lead)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a2', name: 'Duy Linh (Backend Dev)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a3', name: 'Trần Thị Lập Trình (Fullstack Dev)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a4', name: 'Lê Văn Kiểm Thử (QA/QC Tester)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a5', name: 'Nguyễn Văn Quản Lý (Admin/Manager)' }
  ];

  private userMap: Record<string, string> = {
    '64b8d5f1e1a3f5a0c2d9b7a1': 'Nguyễn Bá Hùng',
    '64b8d5f1e1a3f5a0c2d9b7a2': 'Duy Linh',
    '64b8d5f1e1a3f5a0c2d9b7a3': 'Trần Thị Lập Trình',
    '64b8d5f1e1a3f5a0c2d9b7a4': 'Lê Văn Kiểm Thử',
    '64b8d5f1e1a3f5a0c2d9b7a5': 'Nguyễn Văn Quản Lý'
  };

  stats = signal({
    total: 0,
    completed: 0,
    inProgress: 0,
    overdue: 0
  });

  overdueTasks = signal<any[]>([]);
  workloadSummary = signal<WorkloadStatRow[]>([]);

  ngOnInit(): void {
    this.fetchUsersFromApi();
    this.selectedId = '';
  }

  onQueryTypeChange(): void {
    this.selectedId = '';
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
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        Swal.fire({
          icon: 'error',
          title: 'Lỗi tải dữ liệu',
          text: 'Không thể tải dữ liệu thống kê từ máy chủ. Vui lòng thử lại!'
        });
      }
    });
  }

  private calculateDashboardStats(tasks: any[]): void {
    const now = new Date();
    let total = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let overdue = 0;
    const overdues: any[] = [];
    const userGroups: Record<string, { total: number; completed: number; inProgress: number; overdue: number }> = {};

    tasks.forEach(t => {
      const status = String(t.status ?? t.Status ?? 0).toLowerCase();
      const isDone = status === '2' || status === 'completed' || status === 'done';
      const isInProg = status === '1' || status === 'inprogress';

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
        userGroups[uId] = { total: 0, completed: 0, inProgress: 0, overdue: 0 };
      }
      userGroups[uId].total++;
      if (isDone) userGroups[uId].completed++;
      if (isInProg) userGroups[uId].inProgress++;
      if (isOver) userGroups[uId].overdue++;
    });

    this.stats.set({ total, completed, inProgress, overdue });
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
        overdue: g.overdue,
        completionRate: rate
      };
    });

    this.workloadSummary.set(summaryRows);
  }

  // XUẤT BÁO CÁO EXCEL ĐỊNH DẠNG XML SPREADSHEET CÓ BẢNG, MÀU VÀ TỰ CĂN CHỈNH CỘT
  exportToExcel(): void {
    if (this.stats().total === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Chưa có dữ liệu',
        text: 'Vui lòng chọn đối tượng và tải dữ liệu trước khi xuất báo cáo.'
      });
      return;
    }

    const currentTargetName = this.queryType === 'department'
      ? (this.departments.find(d => d.id === this.selectedId)?.name || 'Phòng Ban')
      : (this.users.find(u => u.id === this.selectedId)?.name || 'Nhân Sự');

    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN');

    let xml = `<?xml version="1.0" encoding="utf-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Segoe UI" ss:Size="16" ss:Bold="1" ss:Color="#4338CA"/>
  </Style>
  <Style ss:ID="SubTitle">
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Italic="1" ss:Color="#64748B"/>
  </Style>
  <Style ss:ID="SectionHeader">
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="TableHeader">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#4F46E5" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TableCell">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="TableCellCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellOverdue">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#DC2626"/>
  </Style>
  <Style ss:ID="CellCompleted">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#16A34A"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Báo cáo tiến độ">
  <Table ss:DefaultRowHeight="20">
   <Column ss:Width="200"/>
   <Column ss:Width="160"/>
   <Column ss:Width="120"/>
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   <Column ss:Width="140"/>

   <!-- Tiêu đề báo cáo -->
   <Row ss:Height="26">
    <Cell ss:MergeAcross="5" ss:StyleID="Title"><Data ss:Type="String">BÁO CÁO TIẾN ĐỘ VÀ KPI CÔNG VIỆC</Data></Cell>
   </Row>
   <Row>
    <Cell ss:MergeAcross="5" ss:StyleID="SubTitle"><Data ss:Type="String">Đối tượng: ${currentTargetName}  |  Ngày xuất: ${dateStr}</Data></Cell>
   </Row>
   <Row></Row>

   <!-- I. TỔNG QUAN -->
   <Row>
    <Cell ss:StyleID="SectionHeader"><Data ss:Type="String">I. TỔNG QUAN CHỈ SỐ</Data></Cell>
   </Row>
   <Row ss:Height="22">
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Tổng số công việc</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Đã hoàn thành</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Đang thực hiện</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Quá hạn</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="TableCellCenter"><Data ss:Type="Number">${this.stats().total}</Data></Cell>
    <Cell ss:StyleID="CellCompleted"><Data ss:Type="Number">${this.stats().completed}</Data></Cell>
    <Cell ss:StyleID="TableCellCenter"><Data ss:Type="Number">${this.stats().inProgress}</Data></Cell>
    <Cell ss:StyleID="CellOverdue"><Data ss:Type="Number">${this.stats().overdue}</Data></Cell>
   </Row>
   <Row></Row>

   <!-- II. TIẾN ĐỘ NHÂN SỰ -->
   <Row>
    <Cell ss:StyleID="SectionHeader"><Data ss:Type="String">II. TỔNG HỢP TIẾN ĐỘ THEO NHÂN SỰ</Data></Cell>
   </Row>
   <Row ss:Height="22">
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Nhân sự</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Tổng Task</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Hoàn thành</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Đang thực hiện</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Quá hạn</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Tỷ lệ hoàn thành</Data></Cell>
   </Row>`;

    this.workloadSummary().forEach(row => {
      xml += `
   <Row ss:Height="20">
    <Cell ss:StyleID="TableCell"><Data ss:Type="String">${row.userName}</Data></Cell>
    <Cell ss:StyleID="TableCellCenter"><Data ss:Type="Number">${row.total}</Data></Cell>
    <Cell ss:StyleID="CellCompleted"><Data ss:Type="Number">${row.completed}</Data></Cell>
    <Cell ss:StyleID="TableCellCenter"><Data ss:Type="Number">${row.inProgress}</Data></Cell>
    <Cell ss:StyleID="CellOverdue"><Data ss:Type="Number">${row.overdue}</Data></Cell>
    <Cell ss:StyleID="TableCellCenter"><Data ss:Type="String">${row.completionRate}%</Data></Cell>
   </Row>`;
    });

    xml += `
   <Row></Row>

   <!-- III. TASK QUÁ HẠN -->
   <Row>
    <Cell ss:StyleID="SectionHeader"><Data ss:Type="String">III. DANH SÁCH CÔNG VIỆC QUÁ HẠN</Data></Cell>
   </Row>
   <Row ss:Height="22">
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Tiêu đề Task</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Người phụ trách</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Hạn hoàn thành</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Độ ưu tiên</Data></Cell>
   </Row>`;

    if (this.overdueTasks().length > 0) {
      this.overdueTasks().forEach(t => {
        const d = t.dueDate ? new Date(t.dueDate).toLocaleDateString('vi-VN') : 'Không xác định';
        const p = t.priority === 'High' ? 'Cao' : (t.priority === 'Low' ? 'Thấp' : 'Trung bình');
        xml += `
   <Row ss:Height="20">
    <Cell ss:StyleID="TableCell"><Data ss:Type="String">${t.title}</Data></Cell>
    <Cell ss:StyleID="TableCell"><Data ss:Type="String">${this.getUserDisplayName(t.assigneeId)}</Data></Cell>
    <Cell ss:StyleID="CellOverdue"><Data ss:Type="String">${d}</Data></Cell>
    <Cell ss:StyleID="TableCellCenter"><Data ss:Type="String">${p}</Data></Cell>
   </Row>`;
      });
    } else {
      xml += `
   <Row ss:Height="20">
    <Cell ss:MergeAcross="3" ss:StyleID="TableCell"><Data ss:Type="String">Không có công việc nào bị quá hạn</Data></Cell>
   </Row>`;
    }

    xml += `
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const fileName = `BaoCao_TienDo_${now.getTime()}.xls`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
      icon: 'success',
      title: 'Xuất file thành công',
      text: `File ${fileName} đã được tạo với đầy đủ định dạng bảng biểu!`,
      timer: 2000,
      showConfirmButton: false
    });
  }
}
