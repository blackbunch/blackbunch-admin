const SUPABASE_URL = 'https://vokwkupqqvpkifnaulrn.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_6oV8ES_Cz6BzemiBkDBCLA_wl_g_GQP';
  // Supabase Auth 계정을 만든 뒤 true로 변경하세요. 전환 전에는 기존 로그인을 유지합니다.
  const USE_SUPABASE_AUTH = false;

  const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let calendar;
  let coachMap = {};
  let unassignedStudents = [];
  let currentScheduleType = 'lesson';
  let originalScheduleData = null;
  let coachMobileDate = formatKST(new Date()).date;
  let coachMobileSchedules = [];
  let currentUnassignedStatus = 'pending';
  let fetchedEventsStore = [];
  let appliedSlotHeight = window.matchMedia('(max-width: 900px)').matches ? 72 : 120;

  // DB에 저장된 이름·메모 등 사용자 입력값을 HTML로 해석하지 않도록 합니다.
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function safeColor(value, fallback = '#4f46e5') {
    return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : fallback;
  }

  const BRANCH_ROOMS = {
    '위례점': ['ROOM 1', 'ROOM 2', 'ROOM 3', 'ROOM 4', 'ROOM 5'],
    '미사점': ['ROOM 1', 'ROOM 2', 'ROOM 3', 'ROOM 4', 'ROOM 5'],
    '다산점': ['ROOM 1', 'ROOM 2', 'ROOM 3', 'ROOM 4', 'ROOM 5']
  };

  const DURATION_MAP = {
    '스타일': 50,
    '보컬 메이킹': 50,
    '2:1 그룹': 55,
    '3:1 그룹': 90,
    '상담': 15,
    '체험': 30,
    '30분 대여': 30,
    '1시간 대여': 60,
    '1.5시간 대여': 90,
    '2시간 대여': 120,
    '2.5시간 대여': 150,
    '3시간 대여': 180,
    '3.5시간 대여': 210,
    '4시간 대여': 240,
    '4.5시간 대여': 270,
    '5시간 대여': 300,
    '5.5시간 대여': 330,
    '6시간 대여': 360
  };

  function getRoomsForBranch(branchName) {
    return BRANCH_ROOMS[branchName] || ['ROOM 1', 'ROOM 2', 'ROOM 3', 'ROOM 4', 'ROOM 5'];
  }

  function updateRoomOptions() {
    const selectedBranch = document.getElementById('branchSelect').value;
    const filterRoomSelect = document.getElementById('roomSelect');

    if (!filterRoomSelect) return;

    if (currentScheduleType === 'practice') {
      filterRoomSelect.innerHTML = `<option value="연습실" selected>연습실</option>`;
    } else {
      const roomList = getRoomsForBranch(selectedBranch);
      let options = `<option value="ALL" selected>전체 룸 보기</option>`;
      roomList.forEach(r => {
        options += `<option value="${r}">${r}</option>`;
      });
      filterRoomSelect.innerHTML = options;
    }

    updateRoomOptionsForModal();
    updateRoomOptionsForUnassigned();
  }

  function updateRoomOptionsForModal() {
    const modalBranch = document.getElementById('modalBranch')?.value || '위례점';
    const modalRoomSelect = document.getElementById('modalRoomName');
    if (!modalRoomSelect) return;

    if (currentScheduleType === 'practice') {
      modalRoomSelect.innerHTML = `<option value="연습실" selected>연습실</option>`;
    } else {
      const roomList = getRoomsForBranch(modalBranch);
      let options = '';
      roomList.forEach((r, idx) => {
        options += `<option value="${r}" ${idx === 0 ? 'selected' : ''}>${r}</option>`;
      });
      modalRoomSelect.innerHTML = options;
    }
  }

  function updateRoomOptionsForUnassigned() {
    const unBranch = document.getElementById('unBranch')?.value || '위례점';
    const unRoomSelect = document.getElementById('unRoomName');
    if (!unRoomSelect) return;

    if (currentScheduleType === 'practice') {
      unRoomSelect.innerHTML = `<option value="연습실" selected>연습실</option>`;
    } else {
      const roomList = getRoomsForBranch(unBranch);
      let options = '';
      roomList.forEach((r, idx) => {
        options += `<option value="${r}" ${idx === 0 ? 'selected' : ''}>${r}</option>`;
      });
      unRoomSelect.innerHTML = options;
    }
  }

  function handleBranchChange() {
    updateRoomOptions();
    if (calendar) calendar.refetchEvents();
  }

  function switchScheduleType(type) {
    currentScheduleType = type;
    
    document.getElementById('tabLesson').classList.toggle('active', type === 'lesson');
    document.getElementById('tabConsulting').classList.toggle('active', type === 'consulting');
    document.getElementById('tabPractice').classList.toggle('active', type === 'practice');

    const addBtn = document.getElementById('addScheduleBtn');
    if (type === 'consulting') {
      addBtn.className = "btn btn-danger w-100";
      addBtn.innerText = "+ 상담/체험 일정 추가";
    } else if (type === 'practice') {
      addBtn.className = "btn btn-success w-100";
      addBtn.innerText = "+ 연습실 대여 추가";
    } else {
      addBtn.className = "btn btn-primary w-100";
      addBtn.innerText = "+ 레슨 일정 추가";
    }

    document.getElementById('unassignedTitle').innerText = 
      type === 'consulting' ? '📋 상담/체험 대기 목록' :
      type === 'practice' ? '🎹 연습실 예약 대기 목록' : 
      '⏳ 1단계: 레슨생 정보 등록 (미정 목록)';

    document.getElementById('unassignedAddBtn').innerText = 
      type === 'consulting' ? '+ 상담/체험 신청자 등록' :
      type === 'practice' ? '+ 연습실 이용자 등록' :
      '+ 미정 레슨생 등록';

    document.querySelectorAll('.lesson-only-field').forEach(el => {
      el.style.display = (type === 'lesson') ? 'block' : 'none';
    });
    
    document.querySelectorAll('.consulting-only-field').forEach(el => {
      el.classList.toggle('d-none', type !== 'consulting');
    });

    document.querySelectorAll('.coach-field').forEach(el => {
      el.style.display = (type === 'practice') ? 'none' : 'block';
    });

    document.querySelectorAll('.room-field').forEach(el => {
      el.style.display = (type === 'consulting') ? 'none' : 'block';
    });

    updateRoomOptions();
    updateSubjectOptions();
    updateContactFieldLabels(type);
    updateUnassignedStatusUI();
    loadUnassignedStudents();
    if (calendar) calendar.refetchEvents();
    renderCoachMobileSchedule();
  }

  function updateSubjectOptions() {
    const unSub = document.getElementById('unSubject');
    const modalSub = document.getElementById('modalSubject');
    let options = '';

    if (currentScheduleType === 'consulting') {
      options = `
        <option value="상담" selected>방문 상담 (15분)</option>
        <option value="체험">체험 레슨 (30분)</option>
      `;
    } else if (currentScheduleType === 'practice') {
      options = `
        <option value="30분 대여" selected>30분 대여</option>
        <option value="1시간 대여">1시간 대여</option>
        <option value="1.5시간 대여">1.5시간 대여 (90분)</option>
        <option value="2시간 대여">2시간 대여 (120분)</option>
        <option value="2.5시간 대여">2.5시간 대여</option>
        <option value="3시간 대여">3시간 대여 (180분)</option>
        <option value="3.5시간 대여">3.5시간 대여</option>
        <option value="4시간 대여">4시간 대여</option>
        <option value="4.5시간 대여">4.5시간 대여</option>
        <option value="5시간 대여">5시간 대여</option>
        <option value="5.5시간 대여">5.5시간 대여</option>
        <option value="6시간 대여">6시간 대여</option>
      `;
    } else {
      options = `
        <option value="스타일" selected>스타일 (50분)</option>
        <option value="보컬 메이킹">보컬 메이킹 (50분)</option>
        <option value="2:1 그룹">2:1 그룹 (55분)</option>
        <option value="3:1 그룹">3:1 그룹 (90분)</option>
      `;
    }

    if (unSub) unSub.innerHTML = options;
    if (modalSub) modalSub.innerHTML = options;
    populateTimeOptions();
  }

  function updateStartSessionOptions() {
    const total = parseInt(document.getElementById('unSessions')?.value, 10) || 1;
    const select = document.getElementById('unStartSession');
    if (!select) return;
    const previous = parseInt(select.value, 10) || 1;
    select.innerHTML = Array.from({ length: total }, (_, index) => {
      const session = index + 1;
      return `<option value="${session}">${session}회차부터</option>`;
    }).join('');
    select.value = String(Math.min(previous, total));
  }

  function updateContactFieldLabels(type) {
    const isPractice = type === 'practice';
    const label = isPractice ? '주차등록번호' : '연락처';
    const placeholder = isPractice ? '예: 12가 3456' : '010-0000-0000';
    ['unContactLabel', 'modalContactLabel'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.innerText = label;
    });
    ['unPhone', 'modalPhone'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.placeholder = placeholder;
    });
  }

  function switchUnassignedStatus(status) {
    currentUnassignedStatus = status;
    const statusSelect = document.getElementById('unManagementStatus');
    if (statusSelect) statusSelect.value = status;
    toggleHoldFields();
    updateUnassignedStatusUI();
    renderUnassignedList();
  }

  function updateUnassignedStatusUI() {
    const isLesson = currentScheduleType === 'lesson';
    const statusTabs = document.getElementById('lessonStatusTabs');
    const pendingButton = document.getElementById('pendingStatusBtn');
    const onHoldButton = document.getElementById('onHoldStatusBtn');
    const title = document.getElementById('unassignedTitle');
    const addButton = document.getElementById('unassignedAddBtn');

    if (statusTabs) statusTabs.classList.toggle('d-none', !isLesson);
    if (!isLesson) return;

    if (pendingButton) pendingButton.className = currentUnassignedStatus === 'pending' ? 'btn btn-sm btn-warning' : 'btn btn-sm btn-outline-warning';
    if (onHoldButton) onHoldButton.className = currentUnassignedStatus === 'on_hold' ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-outline-secondary';
    if (title) title.innerText = currentUnassignedStatus === 'on_hold' ? '🗂️ 장기거치 레슨생 목록' : '⏳ 일정 미정 레슨생 목록';
    if (addButton) addButton.innerText = currentUnassignedStatus === 'on_hold' ? '+ 장기거치 레슨생 등록' : '+ 미정 레슨생 등록';
  }

  function toggleHoldFields() {
    const status = document.getElementById('unManagementStatus')?.value;
    document.getElementById('holdDetails')?.classList.toggle('d-none', status !== 'on_hold');
  }

  function calculateEndTime() {
    const subject = document.getElementById('modalSubject').value;
    const startTimeStr = document.getElementById('modalStartTime').value;
    
    if (!startTimeStr) return;

    const durationMinutes = DURATION_MAP[subject] || 60;
    const [hours, minutes] = startTimeStr.split(':').map(Number);

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    date.setMinutes(date.getMinutes() + durationMinutes);

    const endHours = String(date.getHours()).padStart(2, '0');
    const endMinutes = String(date.getMinutes()).padStart(2, '0');

    document.getElementById('modalEndTime').value = `${endHours}:${endMinutes}`;
  }

  function formatKST(dateInput) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(dateInput));
    const value = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return {
      date: `${value.year}-${value.month}-${value.day}`,
      time: `${value.hour}:${value.minute}`
    };
  }

  function parseISOToLocalString(isoStr) {
    if (!isoStr) return '';
    const { date, time } = formatKST(isoStr);
    return `${date}T${time}:00`;
  }

  function formatDateIso(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function toggleRepeatOptions() {
    const chk = document.getElementById('repeatScheduleCheck');
    const group = document.getElementById('repeatOptionsGroup');
    if (chk && group) {
      group.classList.toggle('d-none', !chk.checked);
      if (chk.checked) updateRepeatWeekOptions();
    }
  }

  // 시작 회차부터 마지막 회차까지, 남은 모든 수업을 한 번에 반복 등록할 수 있습니다.
  function updateRepeatWeekOptions() {
    const select = document.getElementById('repeatWeeksSelect');
    if (!select) return;
    const total = parseInt(document.getElementById('modalTotalSessions')?.value, 10) || 1;
    const start = parseInt(document.getElementById('modalSessionNo')?.value, 10) || 1;
    const remaining = Math.max(1, total - start + 1);
    const previous = parseInt(select.value, 10);
    select.innerHTML = Array.from({ length: remaining }, (_, index) => {
      const count = index + 1;
      return `<option value="${count}">${count}주 (${count}회차)</option>`;
    }).join('');
    select.value = String(previous && previous <= remaining ? previous : remaining);
  }

  function populateTimeOptions() {
    const startSelect = document.getElementById('modalStartTime');
    if (!startSelect) return;

    const subject = document.getElementById('modalSubject')?.value;
    const duration = DURATION_MAP[subject] || 60;
    const latestStartMinute = currentScheduleType === 'practice' ? (23 * 60) - duration : (22 * 60) + 50;
    const latestHour = String(Math.floor(latestStartMinute / 60)).padStart(2, '0');
    const latestMinute = String(latestStartMinute % 60).padStart(2, '0');
    startSelect.min = '10:00';
    startSelect.max = `${latestHour}:${latestMinute}`;
    // 상담은 10분, 레슨·연습실은 30분 단위를 브라우저 기본 입력에서도 안내합니다.
    startSelect.step = currentScheduleType === 'consulting' ? '600' : '1800';
  }

  document.addEventListener('DOMContentLoaded', async function() {
    populateTimeOptions();
    updateRoomOptions();
    updateSubjectOptions();
    updateStartSessionOptions();
    updateUnassignedStatusUI();
    checkAuthStatus();
    window.addEventListener('resize', updateCoachMobileMode);
    registerPwa();
  });

  let deferredInstallPrompt = null;

  function registerPwa() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('PWA 준비 실패:', error));
    }
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      document.getElementById('installAppBtn').style.display = 'inline-block';
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      document.getElementById('installAppBtn').style.display = 'none';
    });
  }

  async function installPwaApp() {
    if (!deferredInstallPrompt) {
      alert('아이폰은 Safari의 공유 버튼에서 “홈 화면에 추가”를 선택해 설치할 수 있습니다.');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installAppBtn').style.display = 'none';
  }

  function isCoachMobileMode() {
    return false;
  }

  function getAuthorizedBranches() {
    const user = JSON.parse(sessionStorage.getItem('loginUser'));
    if (!user || user.role === 'admin') return Object.keys(BRANCH_ROOMS);
    return (user.branch || '위례점').split(',').map(branch => branch.trim()).filter(Boolean);
  }

  function restrictBranchSelectsForCoach() {
    const user = JSON.parse(sessionStorage.getItem('loginUser'));
    if (!user || user.role === 'admin') return;
    const branches = getAuthorizedBranches();
    ['branchSelect', 'unBranch', 'modalBranch'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const previous = select.value;
      select.innerHTML = branches.map(branch => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join('');
      select.value = branches.includes(previous) ? previous : branches[0];
      select.disabled = branches.length === 1;
      select.classList.toggle('readonly-select', branches.length === 1);
    });

    const mobileFilter = document.getElementById('coachMobileBranchFilter');
    if (mobileFilter) {
      const previous = mobileFilter.value || 'ALL';
      mobileFilter.innerHTML = `<option value="ALL">전체 담당 지점</option>${branches.map(branch => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join('')}`;
      mobileFilter.value = previous === 'ALL' || branches.includes(previous) ? previous : 'ALL';
    }
    updateRoomOptions();
  }

  function updateCoachMobileMode() {
    document.body.classList.remove('coach-mobile-mode');
    restrictBranchSelectsForCoach();
  }

  function goToCalendarDate(dateValue) {
    if (calendar && dateValue) calendar.gotoDate(dateValue);
  }

  function syncCalendarDatePicker(date) {
    const picker = document.getElementById('calendarDatePicker');
    if (picker && date) picker.value = formatKST(date).date;
  }

  async function checkAuthStatus() {
    let currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    // 모바일 앱을 닫았다 다시 열어도 로그인 상태를 유지합니다.
    let currentUser = JSON.parse(localStorage.getItem('loginUser') || sessionStorage.getItem('loginUser') || 'null');
    if (USE_SUPABASE_AUTH) {
      const { data: { session } } = await sbClient.auth.getSession();
      if (!session) {
        currentUser = null;
      } else {
        const { data: profile, error } = await sbClient.from('user_profiles').select('*').eq('auth_user_id', session.user.id).single();
        if (error) {
          alert('계정 권한 정보를 불러오지 못했습니다. 관리자에게 문의해 주세요.');
          await sbClient.auth.signOut();
          currentUser = null;
        } else {
          currentUser = { id: profile.coach_id, name: profile.name, role: profile.role, branch: profile.branches.join(', ') };
          sessionStorage.setItem('loginUser', JSON.stringify(currentUser));
          localStorage.setItem('loginUser', JSON.stringify(currentUser));
        }
      }
    }
    // 기존 코드에서 현재 사용자 정보를 sessionStorage로도 참조하므로, 재실행 때 동기화합니다.
    if (currentUser) sessionStorage.setItem('loginUser', JSON.stringify(currentUser));
    const loginView = document.getElementById('loginView');
    const loginView = document.getElementById('loginView');
    const mainApp = document.getElementById('mainApp');
    const userInfo = document.getElementById('userInfo');
    const manageCoachBtn = document.getElementById('manageCoachBtn');
    const scheduleHistoryBtn = document.getElementById('scheduleHistoryBtn');

    if (currentUser) {
      loginView.classList.add('d-none');
      mainApp.classList.remove('d-none');

      userInfo.innerText = `${currentUser.name} (${currentUser.role === 'admin' ? '관리자' : '코치'})`;

      if (currentUser.role === 'admin') {
        manageCoachBtn.classList.remove('d-none');
        scheduleHistoryBtn.classList.remove('d-none');
      } else {
        manageCoachBtn.classList.add('d-none');
        scheduleHistoryBtn.classList.add('d-none');
      }

      loadCoachesData().then(() => {
        applyCoachRestriction();
        initCalendar();
        loadUnassignedStudents();
        updateCoachMobileMode();
      });
    } else {
      loginView.classList.remove('d-none');
      mainApp.classList.add('d-none');
    }
  }

  function toggleUnassignedForm() {
    const form = document.getElementById('unassignedForm');
    form.classList.toggle('d-none');
    if (!form.classList.contains('d-none') && currentScheduleType === 'lesson') {
      const statusSelect = document.getElementById('unManagementStatus');
      if (statusSelect) statusSelect.value = currentUnassignedStatus;
      toggleHoldFields();
    }
  }

  function createRecurrenceGroupId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `series-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getScheduleStatusLabel(status) {
    return ({
      attended: '출석', absent: '결석', cancelled: '취소',
      makeup: '보강'
    })[status] || '';
  }

  async function loadUnassignedStudents() {
    const { data, error } = await sbClient
      .from('unassigned_students')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('미정 목록 불러오기 오류:', error);
      return;
    }

    unassignedStudents = (data || []).filter(item => {
      const type = item.schedule_type || (item.subject?.includes('대여') ? 'practice' : (item.subject === '상담' || item.subject === '체험' ? 'consulting' : 'lesson'));
      return currentScheduleType === type;
    });

    renderUnassignedList();
  }

  async function addUnassignedStudent() {
    const branch = document.getElementById('unBranch').value;
    const name = document.getElementById('unStudentName').value.trim();
    const phone = document.getElementById('unPhone')?.value.trim() || '';
    
    const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    const coach = (currentScheduleType === 'practice') ? '연습실' : ((currentUser && currentUser.role !== 'admin') ? currentUser.name : document.getElementById('unCoachName').value);
    
    const subject = document.getElementById('unSubject').value;
    const room = currentScheduleType === 'consulting' ? '상담실' : (document.getElementById('unRoomName')?.value || '연습실');

    const sessionEl = document.getElementById('unSessions');
    const total_sessions = currentScheduleType === 'lesson' ? (sessionEl ? parseInt(sessionEl.value, 10) : 4) : 1;
    const start_session_no = currentScheduleType === 'lesson' ? (parseInt(document.getElementById('unStartSession')?.value, 10) || 1) : 1;
    const management_status = currentScheduleType === 'lesson' ? document.getElementById('unManagementStatus').value : 'pending';
    const hold_reason = currentScheduleType === 'lesson' ? document.getElementById('unHoldReason').value.trim() : null;
    const resume_date = currentScheduleType === 'lesson' ? (document.getElementById('unResumeDate').value || null) : null;

    if (!name) {
      alert('성함을 입력해주세요.');
      return;
    }

    const payload = { 
      branch, 
      name, 
      phone,
      coach, 
      subject, 
      room, 
      total_sessions,
      start_session_no,
      completed_sessions: 0,
      remaining_sessions: total_sessions,
      schedule_type: currentScheduleType,
      management_status,
      hold_reason: management_status === 'on_hold' ? hold_reason : null,
      resume_date: management_status === 'on_hold' ? resume_date : null
    };

    let { error } = await sbClient.from('unassigned_students').insert([payload]);

    // 시작 회차 기능을 추가하기 전 DB에서도 기본 등록은 가능하게 합니다.
    // SQL을 실행하면 위의 첫 저장으로 선택한 시작 회차가 그대로 저장됩니다.
    if (error?.message?.includes('start_session_no')) {
      const { start_session_no: _startSessionNo, ...legacyPayload } = payload;
      ({ error } = await sbClient.from('unassigned_students').insert([legacyPayload]));
      if (!error) alert('시작 회차 DB 설정 전이라 1회차 기준으로 등록되었습니다. 시작 회차를 적용하려면 제공된 SQL을 한 번 실행해 주세요.');
    }

    if (error) {
      alert('저장 실패: ' + error.message);
      return;
    }

    alert(`${name} 님이 ${management_status === 'on_hold' ? '장기거치' : '미정'} 목록에 등록되었습니다.`);
    document.getElementById('unStudentName').value = '';
    if(document.getElementById('unPhone')) document.getElementById('unPhone').value = '';
    document.getElementById('unHoldReason').value = '';
    document.getElementById('unResumeDate').value = '';
    document.getElementById('unManagementStatus').value = 'pending';
    toggleHoldFields();
    toggleUnassignedForm();
    await loadUnassignedStudents();
  }

  function renderUnassignedList() {
    const container = document.getElementById('unassignedList');
    const filterVal = document.getElementById('unassignedCoachFilter').value;
    if (!container) return;

    const statusFilteredStudents = currentScheduleType === 'lesson'
      ? unassignedStudents.filter(student => (student.management_status || 'pending') === currentUnassignedStatus)
      : unassignedStudents;

    if (statusFilteredStudents.length === 0) {
      const label = currentScheduleType === 'lesson'
        ? (currentUnassignedStatus === 'on_hold' ? '장기거치 레슨생' : '일정 미정 레슨생')
        : (currentScheduleType === 'practice' ? '연습실' : '상담/체험');
      container.innerHTML = `<div class="small text-secondary py-1">대기 중인 ${label}이 없습니다.</div>`;
      return;
    }

    let filteredList = statusFilteredStudents;
    if (currentScheduleType !== 'practice' && filterVal !== 'ALL') {
      filteredList = unassignedStudents.filter(s => s.coach === filterVal);
    }

    const grouped = {};
    filteredList.forEach(s => {
      const groupKey = currentScheduleType === 'practice' ? '연습실 대여' : (s.coach || '미지정');
      if (!grouped[groupKey]) grouped[groupKey] = [];
      grouped[groupKey].push(s);
    });

    container.innerHTML = '';

    Object.keys(grouped).forEach(groupKey => {
      const groupColor = currentScheduleType === 'practice' ? '#10b981' : (coachMap[groupKey] || '#f59e0b');
      let cardsHtml = '';

      grouped[groupKey].forEach(s => {
        cardsHtml += `
          <div class="unassigned-card">
            <div class="small">
              <span class="badge bg-secondary me-1">${s.branch}</span>
              <strong class="text-white">${escapeHtml(s.name)}</strong> 
              ${s.phone ? `<span class="text-secondary">(${escapeHtml(s.phone)})</span>` : ''}
              <span class="badge bg-success ms-1">${escapeHtml(s.subject || '연습실')}</span>
              <span class="text-secondary">(${escapeHtml(s.room || '연습실')})</span>
              ${currentScheduleType === 'lesson' && currentUnassignedStatus === 'on_hold' && s.hold_reason ? `<span class="text-warning ms-1">· ${escapeHtml(s.hold_reason)}</span>` : ''}
              ${currentScheduleType === 'lesson' && currentUnassignedStatus === 'on_hold' && s.resume_date ? `<span class="text-info ms-1">재개 예정 ${escapeHtml(s.resume_date)}</span>` : ''}
            </div>
            <div>
              ${currentScheduleType === 'lesson' && currentUnassignedStatus === 'on_hold'
                ? `<button class="btn btn-sm btn-outline-warning py-1 px-3" style="font-size:0.8rem; font-weight:600;" onclick="moveToPending(${s.id})">미정으로 전환</button>`
                : `<button class="btn btn-sm btn-warning py-1 px-3" style="font-size:0.8rem; font-weight:600;" onclick="selectUnassignedStudent(${s.id})">👉 일정 지정</button>
                   ${currentScheduleType === 'lesson' ? `<button class="btn btn-sm btn-outline-secondary py-1 px-2 ms-1" style="font-size:0.8rem;" onclick="moveToOnHold(${s.id})">장기거치</button>` : ''}`}
              <button class="btn btn-sm btn-outline-danger py-1 px-2 ms-1" style="font-size:0.8rem;" onclick="removeUnassigned(${s.id})">삭제</button>
            </div>
          </div>
        `;
      });

      container.innerHTML += `
        <div class="coach-unassigned-section mb-3">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${groupColor};"></span>
            <h6 class="fw-bold m-0 text-white" style="font-size:0.9rem;">🎹 ${escapeHtml(groupKey)} (${grouped[groupKey].length}건)</h6>
          </div>
          ${cardsHtml}
        </div>
      `;
    });
  }

  async function removeUnassigned(dbId) {
    if (!confirm('이 목록을 삭제하시겠습니까?')) return;
    const { error } = await sbClient.from('unassigned_students').delete().eq('id', dbId);
    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      await loadUnassignedStudents();
    }
  }

  async function moveToPending(dbId) {
    const { error } = await sbClient
      .from('unassigned_students')
      .update({ management_status: 'pending', hold_reason: null, resume_date: null })
      .eq('id', dbId);

    if (error) {
      alert('상태 변경 실패: ' + error.message);
      return;
    }
    await loadUnassignedStudents();
  }

  async function moveToOnHold(dbId) {
    const student = unassignedStudents.find(item => item.id === dbId);
    if (!student) return;

    const holdReason = prompt(`${student.name} 님의 장기거치 사유를 입력해 주세요.`, student.hold_reason || '');
    if (holdReason === null) return;

    const resumeDate = prompt('재개 예정일을 입력해 주세요. (선택, 예: 2026-09-01)', student.resume_date || '');
    if (resumeDate === null) return;
    if (resumeDate && !/^\d{4}-\d{2}-\d{2}$/.test(resumeDate)) {
      alert('재개 예정일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    const { error } = await sbClient
      .from('unassigned_students')
      .update({
        management_status: 'on_hold',
        hold_reason: holdReason.trim() || null,
        resume_date: resumeDate || null
      })
      .eq('id', dbId);

    if (error) {
      alert('장기거치 이동 실패: ' + error.message);
      return;
    }
    await loadUnassignedStudents();
  }

  function selectUnassignedStudent(dbId) {
    const data = unassignedStudents.find(item => item.id === dbId);
    if (!data) return;
    if ((data.management_status || 'pending') === 'on_hold') {
      alert('장기거치 레슨생은 먼저 미정으로 전환한 뒤 일정을 지정해 주세요.');
      return;
    }

    openAddModal();

    document.getElementById('currentUnassignedDbId').value = data.id;
    document.getElementById('modalBranch').value = data.branch;
    updateRoomOptionsForModal();

    document.getElementById('modalStudentName').value = data.name;
    document.getElementById('modalTotalSessions').value = data.total_sessions || 1;
    document.getElementById('modalSessionNo').value = data.start_session_no || 1;
    updateRepeatWeekOptions();
    if(data.phone) document.getElementById('modalPhone').value = data.phone;
    if (document.getElementById('modalCoachName')) document.getElementById('modalCoachName').value = data.coach || '연습실';
    document.getElementById('modalSubject').value = data.subject || '1시간 대여';
    if (document.getElementById('modalRoomName')) document.getElementById('modalRoomName').value = data.room || 'ROOM 1';
    populateTimeOptions();
    calculateEndTime();

    alert(`'${data.name}' 님이 선택되었습니다. 날짜와 시간을 설정해 스케줄을 확정하세요.`);
  }

  // 같은 시작 시간의 일정을 세로 카드로 쌓고, 필요한 만큼 캘린더 행 높이를 늘립니다.
  function reorganizeTimeGridEvents() {
    if (!calendar) return;
    const view = calendar.view;
    if (view.type !== 'timeGridWeek' && view.type !== 'timeGridDay') return;

    // 카드 자체에 기록한 시작 시각을 사용하므로 FullCalendar 내부 DOM 구조에 영향을 받지 않습니다.
    const getSchedulePosition = harness => {
      const card = harness.querySelector('.custom-stack-card');
      const time = card?.dataset.startTime;
      if (time) {
        const [hour, minute] = time.split(':').map(Number);
        const minutesFromOpen = (hour * 60) + minute - (10 * 60);
        return { key: time, top: Math.max(0, (minutesFromOpen / 60) * appliedSlotHeight) };
      }

      const top = parseFloat(harness.style.top) || 0;
      return { key: `fallback-${top}`, top };
    };

    const groupHarnesses = harnesses => {
      const groups = new Map();
      harnesses.forEach(harness => {
        const position = getSchedulePosition(harness);
        if (!groups.has(position.key)) groups.set(position.key, { top: position.top, harnesses: [] });
        groups.get(position.key).harnesses.push(harness);
      });
      return Array.from(groups.values());
    };

    const dayCols = document.querySelectorAll('.fc-timegrid-col');
    let maxStackCount = 1;

    dayCols.forEach(col => {
      const harnesses = Array.from(col.querySelectorAll('.fc-timegrid-event-harness'));
      const timeGroups = groupHarnesses(harnesses);
      timeGroups.forEach(group => {
        maxStackCount = Math.max(maxStackCount, group.harnesses.length);
      });
    });

    const baseSlotHeight = window.matchMedia('(max-width: 900px)').matches ? 72 : 120;
    const requiredSlotHeight = Math.max(baseSlotHeight, (maxStackCount * 35) + 10);
    const calendarEl = document.getElementById('calendar');
    if (calendarEl && requiredSlotHeight !== appliedSlotHeight) {
      appliedSlotHeight = requiredSlotHeight;
      calendarEl.style.setProperty('--schedule-slot-height', `${requiredSlotHeight}px`);
      setTimeout(reorganizeTimeGridEvents, 0);
      return;
    }

    dayCols.forEach(col => {
      const harnesses = Array.from(col.querySelectorAll('.fc-timegrid-event-harness'));
      const timeGroups = groupHarnesses(harnesses);

      timeGroups.forEach(group => {
        let cardTop = group.top;
        group.harnesses.forEach(harness => {
          harness.style.left = '2px';
          harness.style.right = '2px';
          harness.style.width = 'calc(100% - 4px)';
          harness.style.top = `${cardTop}px`;
          const card = harness.querySelector('.custom-stack-card');
          cardTop += (card?.offsetHeight || 32) + 3;
        });
      });
    });
  }

  function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    if (calendar) {
      calendar.refetchEvents();
      return;
    }

    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    const isCoachMobile = Boolean(isMobile && currentUser?.role !== 'admin');
    const headerToolbar = isMobile
      ? { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay,listWeek' }
      : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' };

    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: isMobile ? 'timeGridWeek' : 'timeGridWeek',
      locale: 'ko',
      firstDay: 1,
      height: 'auto',
      contentHeight: 'auto',
      displayEventTime: false,
      allDaySlot: false,
      slotMinTime: '10:00:00',
      slotMaxTime: '23:00:00',
      slotDuration: '01:00:00',
      slotLabelInterval: '01:00:00',
      eventOverlap: true,
      slotEventOverlap: true,

      dayHeaderContent: function(arg) {
        // 월/주 화면에 실제 표시된 첫 날짜를 기준으로 헤더를 만듭니다.
        // 일부 환경에서 arg.date가 1970년 기준으로 들어오는 표시 오류를 방지합니다.
        const visibleStart = calendar?.view?.activeStart;
        const d = visibleStart ? new Date(visibleStart) : new Date(arg.date);
        if (visibleStart) {
          const columnOffset = (arg.date.getDay() - visibleStart.getDay() + 7) % 7;
          d.setDate(d.getDate() + columnOffset);
        }
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = dayNames[d.getDay()];
        return `${month}.${date}(${dayName})`;
      },

      buttonText: { today: '오늘', month: '월', week: '주', day: '일', listWeek: '목록' },
      headerToolbar,
      windowResize: function() {
        const compactMobile = window.matchMedia('(max-width: 900px)').matches;
        const user = JSON.parse(sessionStorage.getItem('loginUser'));
        if (compactMobile && calendar.view.type !== 'timeGridWeek' && calendar.view.type !== 'timeGridDay' && calendar.view.type !== 'listWeek') {
          calendar.changeView('timeGridWeek');
        }
      },
      
      events: async function(fetchInfo, successCallback, failureCallback) {
        try {
          const selectedBranch = document.getElementById('branchSelect').value;
          const selectedRoom = document.getElementById('roomSelect').value;
          const selectedCoach = document.getElementById('coachFilter').value;

          let query = sbClient.from('schedules').select('*').eq('branch', selectedBranch)
            .lt('start_time', fetchInfo.endStr).gt('end_time', fetchInfo.startStr);

          if (currentScheduleType !== 'consulting' && selectedRoom !== 'ALL') {
            query = query.eq('room_name', selectedRoom);
          }
          if (currentScheduleType !== 'practice' && selectedCoach !== 'ALL') {
            query = query.eq('coach_name', selectedCoach);
          }

          const { data: schedulesData, error } = await query;
          if (error) throw error;

          const filteredData = (schedulesData || []).filter(item => {
            if (item.schedule_status === 'cancelled') return false;
            const type = item.schedule_type || (item.subject?.includes('대여') ? 'practice' : (item.subject === '상담' || item.subject === '체험' ? 'consulting' : 'lesson'));
            return currentScheduleType === type;
          });

          let lessonProgressByStudent = {};
          let allLessonSchedules = schedulesData || [];
          if (currentScheduleType === 'lesson') {
            const { data: progressData, error: progressError } = await sbClient
              .from('lesson_progress')
              .select('student_name, coach_name, total_sessions, remaining_sessions');
            if (progressError) {
              console.warn('잔여 회차 계산을 불러오지 못했습니다:', progressError.message);
            } else {
              (progressData || []).forEach(progress => {
                lessonProgressByStudent[`${progress.student_name}_${progress.coach_name}`] = progress;
              });
            }

            // 보이는 기간 밖의 취소된 회차도 시작 회차 판단에는 포함해야 합니다.
            const { data: allLessons, error: allLessonsError } = await sbClient
              .from('schedules')
              .select('*')
              .eq('branch', selectedBranch);
            if (allLessonsError) {
              console.warn('전체 회차 정보를 불러오지 못했습니다:', allLessonsError.message);
            } else {
              allLessonSchedules = (allLessons || []).filter(item => {
                const type = item.schedule_type || (item.subject?.includes('대여') ? 'practice' : (item.subject === '상담' || item.subject === '체험' ? 'consulting' : 'lesson'));
                return type === 'lesson';
              });
            }
          }

          if (currentScheduleType === 'lesson') {
            const studentSchedulesMap = {};
            const allCourseSchedulesMap = {};
            const courseKey = item => item.recurrence_group_id
              ? `series_${item.recurrence_group_id}`
              : `${item.student_name}_${item.coach_name}_${item.total_sessions || 1}`;

            allLessonSchedules.forEach(item => {
              if (!item.student_name || item.student_name.includes('미정')) return;
              const key = courseKey(item);
              if (!allCourseSchedulesMap[key]) allCourseSchedulesMap[key] = [];
              allCourseSchedulesMap[key].push(item);
            });
            filteredData.forEach(item => {
              if (item.student_name && !item.student_name.includes('미정')) {
                const key = courseKey(item);
                if (!studentSchedulesMap[key]) studentSchedulesMap[key] = [];
                studentSchedulesMap[key].push(item);
              }
            });

            Object.keys(studentSchedulesMap).forEach(key => {
              studentSchedulesMap[key].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
              const courseSchedules = allCourseSchedulesMap[key] || studentSchedulesMap[key];
              const total = courseSchedules[0]?.total_sessions || studentSchedulesMap[key].length;
              const progressKey = `${studentSchedulesMap[key][0]?.student_name}_${studentSchedulesMap[key][0]?.coach_name}`;
              const progress = lessonProgressByStudent[progressKey];
              const totalSessions = progress?.total_sessions || total;
              // 시작 회차 앞의 수업은 이미 진행된 수업입니다. 반면 미래에 예약한 일정은
              // 예약만으로 차감하면 안 되므로 잔여 회차를 줄이지 않습니다.
              const firstSessionNo = Math.min(...courseSchedules.map((item, index) => Number(item.session_no) || (index + 1)));
              const carriedCompleted = Math.max(0, firstSessionNo - 1);
              const attendedAfterRegistration = Math.max(0, totalSessions - (progress?.remaining_sessions ?? totalSessions));
              const completed = Math.min(totalSessions, carriedCompleted + attendedAfterRegistration);
              const remaining = Math.max(0, totalSessions - completed);

              studentSchedulesMap[key].forEach((item, index) => {
                item._session_no = item.session_no || (index + 1);
                item._total_sessions = totalSessions;
                item._remaining_sessions = remaining;
              });
            });
          }

          filteredData.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
          fetchedEventsStore = filteredData;

          const events = filteredData.map((item, index) => {
            const isUnassigned = !item.student_name || item.student_name.includes('미정');
            
            let displayTitle = '';
            let eventBgColor = coachMap[item.coach_name] || '#5046e5';
            
            // ROOM 1, ROOM 2 등의 텍스트에서 숫자만 추출 (예: 'ROOM 1' -> '1')
            const rawRoom = item.room_name || '';
            const numMatch = rawRoom.match(/\d+/);
            const roomNum = numMatch ? numMatch[0] : rawRoom;

            if (currentScheduleType === 'practice') {
              displayTitle = `${roomNum}. ${item.student_name || '이용자'}(${item.coach_name || '코치'}) 1/1회`;
              eventBgColor = '#10b981';
            } else if (currentScheduleType === 'consulting') {
              const statusTag = item.consult_status ? `[${item.consult_status}]` : `[${item.subject || '상담'}]`;
              displayTitle = `${roomNum}. ${item.student_name || '신청자'}(${item.coach_name}) ${statusTag}`;
              eventBgColor = item.consult_status === '취소' ? '#4b5563' : (item.subject === '체험' ? '#f59e0b' : '#ec4899');
            } else {
              const sessionText = item._session_no ? `${item._session_no}/${item._total_sessions || 4}회` : '1회';
              const statusLabel = getScheduleStatusLabel(item.schedule_status);
              displayTitle = `${roomNum}. ${item.student_name || '미정'}(${item.coach_name}) ${sessionText}${statusLabel ? ` [${statusLabel}]` : ''}`;
            }

            return {
              id: item.id,
              title: displayTitle,
              start: parseISOToLocalString(item.start_time),
              end: parseISOToLocalString(item.end_time),
              allDay: false,
              backgroundColor: isUnassigned ? '#1c1d22' : eventBgColor,
              borderColor: '#ffffff',
              extendedProps: item
            };
          });

          successCallback(events);
          setTimeout(reorganizeTimeGridEvents, 50);
        } catch (err) {
          console.error("스케줄 로딩 오류:", err);
          failureCallback(err);
        }
      },

      datesSet: function() {
        syncCalendarDatePicker(calendar.getDate());
        setTimeout(reorganizeTimeGridEvents, 50);
      },

      eventContent: function(arg) {
        const { time } = formatKST(arg.event.start);
        // 모바일 주간 화면에서는 긴 일정명을 한 줄로 압축해 세로 글자 현상을 방지합니다.
        const compactTitle = window.matchMedia('(max-width: 900px)').matches
          ? arg.event.title
            .replace(/^\d+\.\s*/, '')
            .replace(/\([^)]*\)/g, '')
            .replace(/회(?=\s|$)/, '')
            .replace(/\s*\[[^\]]+\]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
          : arg.event.title;
        return {
          html: `<div class="custom-stack-card" data-start-time="${time}" title="${escapeHtml(arg.event.title)}" style="background-color: ${safeColor(arg.event.backgroundColor)};">${escapeHtml(compactTitle)}</div>`
        };
      },

      eventClick: function(info) {
        const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
        if (currentUser?.role !== 'admin' && info.event.extendedProps.coach_name !== currentUser.name) {
          alert('다른 코치의 일정은 확인만 가능하며 수정할 수 없습니다.');
          return;
        }
        openEditModal(info.event.extendedProps);
      }
    });

    calendar.render();
  }

  async function loadCoachesData() {
    const { data: coaches, error } = await sbClient.from(USE_SUPABASE_AUTH ? 'coaches_public' : 'coaches').select('*');
    if (error) {
      console.error('코치 목록 불러오기 오류:', error);
      return;
    }

    const coachFilter = document.getElementById('coachFilter');
    const unassignedCoachFilter = document.getElementById('unassignedCoachFilter');
    const modalCoachName = document.getElementById('modalCoachName');
    const unCoachName = document.getElementById('unCoachName');

    if (coachFilter) coachFilter.innerHTML = '<option value="ALL" selected>전체 코치 보기</option>';
    if (unassignedCoachFilter) unassignedCoachFilter.innerHTML = '<option value="ALL" selected>전체 코치 보기</option>';
    if (modalCoachName) modalCoachName.innerHTML = '';
    if (unCoachName) unCoachName.innerHTML = '';
    coachMap = {};

    (coaches || []).forEach(c => {
      coachMap[c.name] = safeColor(c.color);
      const coachName = escapeHtml(c.name);
      if (coachFilter) coachFilter.innerHTML += `<option value="${coachName}">${coachName}</option>`;
      if (unassignedCoachFilter) unassignedCoachFilter.innerHTML += `<option value="${coachName}">${coachName}</option>`;
      if (modalCoachName) modalCoachName.innerHTML += `<option value="${coachName}">${coachName}</option>`;
      if (unCoachName) unCoachName.innerHTML += `<option value="${coachName}">${coachName}</option>`;
    });

    const historyCoachFilter = document.getElementById('historyCoachFilter');
    if (historyCoachFilter) {
      historyCoachFilter.innerHTML = '<option value="ALL">전체 코치</option>';
      (coaches || []).forEach(c => {
        historyCoachFilter.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`;
      });
    }

    const coachTableBody = document.getElementById('coachTableBody');
    if (coachTableBody) {
      coachTableBody.innerHTML = '';

      (coaches || []).forEach(c => {
        const branchBadges = (c.branch || '위례점')
          .split(',')
          .map(b => `<span class="badge bg-secondary me-1">${escapeHtml(b.trim())}</span>`)
          .join('');

        coachTableBody.innerHTML += `
          <tr>
            <td>${branchBadges}</td>
            <td class="fw-bold">${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.email || c.username || '-')}</td>
            <td>${c.role === 'admin' ? '<span class="badge bg-danger">관리자</span>' : '<span class="badge bg-primary">코치</span>'}</td>
            <td><div style="width:20px; height:20px; background-color:${safeColor(c.color)}; border-radius:4px;"></div></td>
            <td><button class="btn btn-sm btn-outline-danger" style="border-radius:6px;" onclick="deleteCoach('${c.id}')">삭제</button></td>
          </tr>
        `;
      });
    }
  }

  async function handleLogin() {
    const idInput = document.getElementById('loginEmail').value.trim();
    const pwInput = document.getElementById('loginPassword').value.trim();

    if (!idInput || !pwInput) {
      alert("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }

    if (USE_SUPABASE_AUTH) {
      const { error } = await sbClient.auth.signInWithPassword({ email: idInput, password: pwInput });
      if (error) {
        alert('아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      await checkAuthStatus();
      return;
    }

    if (idInput === 'admin' && pwInput === 'qmffor@@@@') {
      const userData = { id: 'admin', name: '관리자', role: 'admin' };
      sessionStorage.setItem('loginUser', JSON.stringify(userData));
      const userData = { id: 'admin', name: '관리자', role: 'admin' };
      sessionStorage.setItem('loginUser', JSON.stringify(userData));
      localStorage.setItem('loginUser', JSON.stringify(userData));
      await checkAuthStatus();
      return;
    }

    const { data: coaches, error } = await sbClient
      .from('coaches')
      .select('*')
      .or(`email.eq.${idInput},username.eq.${idInput}`)
      .eq('password', pwInput);

    if (error) {
      alert('로그인 오류: ' + error.message);
      return;
    }

    if (coaches && coaches.length > 0) {
      const matchedCoach = coaches[0];
      const userData = {
        id: matchedCoach.id,
        name: matchedCoach.name,
        role: matchedCoach.role || 'coach',
        branch: matchedCoach.branch
      };
      sessionStorage.setItem('loginUser', JSON.stringify(userData));
      };
      sessionStorage.setItem('loginUser', JSON.stringify(userData));
      localStorage.setItem('loginUser', JSON.stringify(userData));
      await checkAuthStatus();
    } else {
      alert('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  }

  async function handleLogout() {
    if (USE_SUPABASE_AUTH) await sbClient.auth.signOut();
    sessionStorage.removeItem('loginUser');
    localStorage.removeItem('loginUser');
    location.reload();
    location.reload();
  }

  function applyCoachRestriction() {
    const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    const modalCoachName = document.getElementById('modalCoachName');
    const unCoachName = document.getElementById('unCoachName');
    const coachFilter = document.getElementById('coachFilter');
    const unassignedCoachFilter = document.getElementById('unassignedCoachFilter');

    if (currentUser && currentUser.role !== 'admin') {
      restrictBranchSelectsForCoach();
      if (modalCoachName) {
        modalCoachName.value = currentUser.name;
        modalCoachName.disabled = true;
        modalCoachName.classList.add('readonly-select');
      }
      if (unCoachName) {
        unCoachName.value = currentUser.name;
        unCoachName.disabled = true;
        unCoachName.classList.add('readonly-select');
      }
      if (coachFilter) {
        coachFilter.value = 'ALL';
        coachFilter.disabled = false;
        coachFilter.classList.remove('readonly-select');
      }
      if (unassignedCoachFilter) {
        unassignedCoachFilter.value = currentUser.name;
        unassignedCoachFilter.disabled = true;
        unassignedCoachFilter.classList.add('readonly-select');
      }
    } else {
      if (modalCoachName) {
        modalCoachName.disabled = false;
        modalCoachName.classList.remove('readonly-select');
      }
      if (unCoachName) {
        unCoachName.disabled = false;
        unCoachName.classList.remove('readonly-select');
      }
      if (coachFilter) {
        coachFilter.disabled = false;
        coachFilter.classList.remove('readonly-select');
      }
      if (unassignedCoachFilter) {
        unassignedCoachFilter.disabled = false;
        unassignedCoachFilter.classList.remove('readonly-select');
      }
    }
  }

  function setupModalView(type) {
    const isConsulting = (type === 'consulting');
    const isPractice = (type === 'practice');

    document.getElementById('modalNameLabel').innerText = 
      isConsulting ? '상담/체험 신청자 이름' :
      isPractice ? '연습실 이용자 이름' : '수강생 이름';

    document.getElementById('modalSubjectLabel').innerText = 
      isPractice ? '연습실 이용 시간' :
      isConsulting ? '상담 / 체험 구분' : '과목 / 레슨 구분';

    document.querySelectorAll('.consulting-only-field').forEach(el => {
      el.classList.toggle('d-none', !isConsulting);
    });

    document.querySelectorAll('.practice-field').forEach(el => {
      if (isPractice) el.classList.remove('d-none');
    });

    document.querySelectorAll('.coach-field').forEach(el => {
      el.style.display = isPractice ? 'none' : 'block';
    });

    document.querySelectorAll('.lesson-only-field').forEach(el => {
      el.style.display = (type === 'lesson') ? 'block' : 'none';
    });

    updateRoomOptions();
    updateSubjectOptions();
    updateContactFieldLabels(type);
  }

  function openAddModal() {
    document.getElementById('modalTitle').innerText = 
      currentScheduleType === 'consulting' ? "상담/체험 일정 추가" :
      currentScheduleType === 'practice' ? "연습실 대여 추가" : "레슨 일정 추가";

    document.getElementById('scheduleId').value = "";
    originalScheduleData = null;
    document.getElementById('currentUnassignedDbId').value = "";
    document.getElementById('recurrenceGroupId').value = "";
    document.getElementById('modalTotalSessions').value = currentScheduleType === 'lesson' ? "4" : "1";
    document.getElementById('modalSessionNo').value = "1";
    document.getElementById('modalStudentName').value = "";
    document.getElementById('modalPhone').value = "";
    document.getElementById('modalMemo').value = "";
    document.getElementById('modalScheduleStatus').value = 'scheduled';
    
    setupModalView(currentScheduleType);

    const nowKST = formatKST(new Date());
    document.getElementById('modalDate').value = isCoachMobileMode() ? coachMobileDate : nowKST.date;
    document.getElementById('modalStartTime').value = "10:00";
    
    calculateEndTime();

    document.getElementById('deleteScheduleBtn').classList.add('d-none');
    document.getElementById('recurrenceEditGroup').classList.add('d-none');
    document.getElementById('applyToFutureSeriesCheck').checked = false;
    document.getElementById('cancelFutureSeriesCheck').checked = false;
    const repeatChk = document.getElementById('repeatScheduleCheck');
    if (repeatChk) repeatChk.checked = false;
    toggleRepeatOptions();

    applyCoachRestriction();
    new bootstrap.Modal(document.getElementById('scheduleModal')).show();
  }

  function openEditModal(scheduleData) {
    originalScheduleData = { ...scheduleData };
    const type = scheduleData.schedule_type || (scheduleData.subject?.includes('대여') ? 'practice' : (scheduleData.subject === '상담' || scheduleData.subject === '체험' ? 'consulting' : 'lesson'));
    setupModalView(type);

    document.getElementById('modalTitle').innerText = 
      type === 'consulting' ? "상담/체험 일정 수정" :
      type === 'practice' ? "연습실 대여 수정" : "레슨 일정 수정";

    document.getElementById('scheduleId').value = scheduleData.id;
    document.getElementById('currentUnassignedDbId').value = "";
    document.getElementById('recurrenceGroupId').value = scheduleData.recurrence_group_id || '';
    document.getElementById('modalTotalSessions').value = scheduleData.total_sessions || 1;
    document.getElementById('modalSessionNo').value = scheduleData.session_no || 1;
    document.getElementById('modalBranch').value = scheduleData.branch || '위례점';
    
    updateRoomOptionsForModal();

    document.getElementById('modalStudentName').value = scheduleData.student_name;
    document.getElementById('modalScheduleStatus').value = scheduleData.schedule_status === 'makeup' ? 'makeup' : 'scheduled';
    
    if (type !== 'practice' && document.getElementById('modalCoachName')) {
      document.getElementById('modalCoachName').value = scheduleData.coach_name;
    }
    
    document.getElementById('modalSubject').value = scheduleData.subject || (type === 'practice' ? '1시간 대여' : (type === 'consulting' ? '상담' : '스타일'));
    populateTimeOptions();
    
    if (document.getElementById('modalRoomName')) {
      document.getElementById('modalRoomName').value = scheduleData.room_name || 'ROOM 1';
    }
    
    if (type === 'consulting' || type === 'practice') {
      document.getElementById('modalPhone').value = scheduleData.phone || '';
      document.getElementById('modalMemo').value = scheduleData.memo || '';
    }

    if (type === 'consulting') {
      document.getElementById('modalConsultStatus').value = scheduleData.consult_status || '예약완료';
    }

    if (scheduleData.start_time) {
      const startKST = formatKST(scheduleData.start_time);
      document.getElementById('modalDate').value = startKST.date;
      document.getElementById('modalStartTime').value = startKST.time;
    }

    if (scheduleData.end_time) {
      const endKST = formatKST(scheduleData.end_time);
      document.getElementById('modalEndTime').value = endKST.time;
    } else {
      calculateEndTime();
    }

    document.getElementById('deleteScheduleBtn').classList.remove('d-none');
    const canApplyToSeries = type === 'lesson' && Boolean(scheduleData.recurrence_group_id);
    document.getElementById('recurrenceEditGroup').classList.toggle('d-none', !canApplyToSeries);
    document.getElementById('applyToFutureSeriesCheck').checked = false;
    document.getElementById('cancelFutureSeriesCheck').checked = false;
    const repeatChk = document.getElementById('repeatScheduleCheck');
    if (repeatChk) repeatChk.checked = false;
    toggleRepeatOptions();

    applyCoachRestriction();
    new bootstrap.Modal(document.getElementById('scheduleModal')).show();
  }

  async function assertNoScheduleConflict(candidates, excludeId = null) {
    const excludedIds = new Set((Array.isArray(excludeId) ? excludeId : [excludeId]).filter(Boolean).map(String));
    for (const candidate of candidates) {
      const { data: overlaps, error } = await sbClient
        .from('schedules')
        .select('id, student_name, coach_name, room_name, start_time, end_time, schedule_status')
        .eq('branch', candidate.branch)
        .lt('start_time', candidate.end_time)
        .gt('end_time', candidate.start_time);

      if (error) throw error;

      const conflict = (overlaps || []).find(existing => {
        if (excludedIds.has(String(existing.id))) return false;
        if (existing.schedule_status === 'cancelled') return false;
        const sameRoom = existing.room_name === candidate.room_name;
        const sameCoach = candidate.coach_name !== '연습실' && existing.coach_name === candidate.coach_name;
        return sameRoom || sameCoach;
      });

      if (conflict) {
        const reason = conflict.room_name === candidate.room_name ? `룸 ${candidate.room_name}` : `코치 ${candidate.coach_name}`;
        const time = formatKST(conflict.start_time).time;
        throw new Error(`${reason}에 ${time}부터 이미 ${conflict.student_name || '다른'} 일정이 있습니다.`);
      }
    }
  }

  function formatScheduleForHistory(data) {
    if (!data) return '';
    const time = data.start_time ? `${formatKST(data.start_time).date} ${formatKST(data.start_time).time}` : '';
    return `${data.student_name || '이름 없음'} · ${data.coach_name || '코치 미지정'} · ${data.room_name || ''} · ${time}`;
  }

  function getChangedFields(before, after) {
    const labels = {
      branch: '지점', student_name: '이름', coach_name: '담당 코치', subject: '과목',
      room_name: '룸', start_time: '시작 시간', end_time: '종료 시간', schedule_status: '수업 상태'
    };
    return Object.keys(labels).filter(key => (before?.[key] || '') !== (after?.[key] || '')).map(key => labels[key]);
  }

  async function writeScheduleHistory(action, scheduleData, description) {
    const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    const { error } = await sbClient.from('schedule_history').insert([{
      schedule_id: scheduleData.id || null,
      action,
      actor_name: currentUser?.name || '알 수 없음',
      target_coach_name: scheduleData.coach_name || '연습실',
      student_name: scheduleData.student_name || '',
      description,
      snapshot: scheduleData
    }]);
    if (error) console.error('일정 변경 이력 저장 실패:', error);
  }

  function changeCoachMobileDate(days) {
    const date = new Date(`${coachMobileDate}T12:00:00+09:00`);
    date.setDate(date.getDate() + days);
    coachMobileDate = formatKST(date).date;
    renderCoachMobileSchedule();
  }

  function goToCoachMobileToday() {
    coachMobileDate = formatKST(new Date()).date;
    renderCoachMobileSchedule();
  }

  async function renderCoachMobileSchedule() {
    if (!isCoachMobileMode()) return;
    const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    const title = document.getElementById('coachMobileDateTitle');
    const list = document.getElementById('coachMobileScheduleList');
    if (!currentUser || !title || !list) return;

    const date = new Date(`${coachMobileDate}T12:00:00+09:00`);
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    title.textContent = `${Number(coachMobileDate.slice(5, 7))}월 ${Number(coachMobileDate.slice(8, 10))}일 (${dayName})`;
    list.innerHTML = '<div class="small text-secondary py-3 text-center">일정을 불러오는 중입니다.</div>';

    const dayStart = `${coachMobileDate}T00:00:00+09:00`;
    const nextDate = new Date(`${coachMobileDate}T12:00:00+09:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayEnd = `${formatKST(nextDate).date}T00:00:00+09:00`;
    const branchFilter = document.getElementById('coachMobileBranchFilter')?.value || 'ALL';
    let query = sbClient.from('schedules').select('*')
      .eq('coach_name', currentUser.name)
      .gte('start_time', dayStart).lt('start_time', dayEnd)
      .order('start_time', { ascending: true });
    if (branchFilter !== 'ALL') query = query.eq('branch', branchFilter);
    const { data, error } = await query;

    if (error) {
      list.innerHTML = `<div class="small text-danger py-3 text-center">일정을 불러오지 못했습니다: ${escapeHtml(error.message)}</div>`;
      return;
    }

    const schedules = (data || []).filter(item => {
      const type = item.schedule_type || (item.subject?.includes('대여') ? 'practice' : (item.subject === '상담' || item.subject === '체험' ? 'consulting' : 'lesson'));
      return type === currentScheduleType;
    });

    // 모바일 카드에서도 전체 레슨 이력을 기준으로 현재 회차를 계산합니다.
    let sessionInfoById = {};
    if (currentScheduleType === 'lesson' && schedules.length) {
      const { data: allCoachSchedules, error: allSchedulesError } = await sbClient
        .from('schedules')
        .select('id, student_name, coach_name, start_time, total_sessions, session_no, schedule_type, subject')
        .eq('coach_name', currentUser.name);
      if (!allSchedulesError) {
        const lessonGroups = {};
        (allCoachSchedules || []).forEach(item => {
          const type = item.schedule_type || (item.subject?.includes('대여') ? 'practice' : (item.subject === '상담' || item.subject === '체험' ? 'consulting' : 'lesson'));
          if (type !== 'lesson' || !item.student_name) return;
          const key = `${item.student_name}_${item.coach_name}`;
          if (!lessonGroups[key]) lessonGroups[key] = [];
          lessonGroups[key].push(item);
        });
        Object.values(lessonGroups).forEach(group => {
          group.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
          const total = group[0]?.total_sessions || group.length;
          group.forEach((item, index) => {
            sessionInfoById[item.id] = `${item.session_no || (index + 1)}/${item.total_sessions || total}회`;
          });
        });
      }
    }
    coachMobileSchedules = schedules;
    if (!schedules.length) {
      list.innerHTML = '<div class="small text-secondary py-4 text-center">이 날은 등록된 일정이 없습니다.</div>';
      return;
    }

    list.innerHTML = schedules.map(schedule => {
      const start = formatKST(schedule.start_time).time;
      const end = formatKST(schedule.end_time).time;
      const cancelled = schedule.schedule_status === 'cancelled' ? ' cancelled' : '';
      const status = getScheduleStatusLabel(schedule.schedule_status) || '예정';
      return `<div class="coach-schedule-card${cancelled}" onclick="openCoachMobileSchedule('${schedule.id}')">
        <div class="d-flex justify-content-between align-items-center gap-2"><span class="coach-schedule-time">${escapeHtml(start)}–${escapeHtml(end)}</span><span class="badge bg-secondary">${escapeHtml(status)}</span></div>
        <div class="coach-schedule-name mt-1">${escapeHtml(schedule.student_name || '이름 없음')}${sessionInfoById[schedule.id] ? ` <span class="text-warning" style="font-size:0.85rem;">${escapeHtml(sessionInfoById[schedule.id])}</span>` : ''}</div>
        <div class="coach-schedule-meta"><span class="badge bg-primary">${escapeHtml(schedule.branch || '')}</span> ${escapeHtml(schedule.subject || '')} · ${escapeHtml(schedule.room_name || '')}</div>
        ${currentScheduleType === 'lesson' ? `<div class="coach-status-actions">
          <button class="btn btn-sm btn-outline-info" onclick="event.stopPropagation(); updateMobileScheduleStatus('${schedule.id}', 'makeup')">보강</button>
        </div>` : ''}
      </div>`;
    }).join('');
  }

  function openCoachMobileSchedule(id) {
    const schedule = coachMobileSchedules.find(item => String(item.id) === String(id));
    if (schedule) openEditModal(schedule);
  }

  async function updateMobileScheduleStatus(id, status) {
    const { data: schedule, error: fetchError } = await sbClient.from('schedules').select('*').eq('id', id).single();
    if (fetchError) {
      alert('일정을 찾지 못했습니다: ' + fetchError.message);
      return;
    }
    const { error } = await sbClient.from('schedules').update({ schedule_status: status }).eq('id', id);
    if (error) {
      alert('상태 변경 실패: ' + error.message);
      return;
    }
    await writeScheduleHistory('updated', { ...schedule, schedule_status: status }, `${formatScheduleForHistory(schedule)} 수업 상태를 ${getScheduleStatusLabel(status) || '예정'}으로 변경`);
    if (calendar) calendar.refetchEvents();
    await renderCoachMobileSchedule();
  }

  async function openScheduleHistory() {
    new bootstrap.Modal(document.getElementById('scheduleHistoryModal')).show();
    await loadScheduleHistory();
  }

  async function loadScheduleHistory() {
    const container = document.getElementById('scheduleHistoryList');
    const coach = document.getElementById('historyCoachFilter').value;
    container.innerHTML = '<span class="text-secondary">변경 이력을 불러오는 중입니다.</span>';
    let query = sbClient.from('schedule_history').select('*').order('created_at', { ascending: false }).limit(200);
    if (coach !== 'ALL') query = query.eq('target_coach_name', coach);
    const { data, error } = await query;
    if (error) {
      container.innerHTML = `<span class="text-danger">이력을 불러오지 못했습니다: ${escapeHtml(error.message)}</span>`;
      return;
    }
    if (!data?.length) {
      container.innerHTML = '<span class="text-secondary">기록된 변경 이력이 없습니다.</span>';
      return;
    }
    const actionLabel = { created: '추가', updated: '수정', deleted: '삭제', restored: '복원' };
    container.innerHTML = data.map(log => {
      const time = formatKST(log.created_at);
      const canRestore = Boolean(log.schedule_id && log.snapshot?.start_time && log.snapshot?.end_time);
      return `<div class="border border-secondary rounded p-2 mb-2">
        <div class="d-flex justify-content-between gap-2"><strong>${escapeHtml(log.student_name || '일정')}</strong><span class="badge bg-secondary">${escapeHtml(actionLabel[log.action] || log.action)}</span></div>
        <div class="text-secondary mt-1">담당: ${escapeHtml(log.target_coach_name)} · 변경: ${escapeHtml(log.actor_name)} · ${escapeHtml(time.date)} ${escapeHtml(time.time)}</div>
        <div class="mt-1">${escapeHtml(log.description || '')}</div>
        ${canRestore ? `<button class="btn btn-sm btn-outline-warning mt-2" onclick="restoreScheduleFromHistory('${log.id}')">이 상태로 복원</button>` : ''}
      </div>`;
    }).join('');
  }

  async function restoreScheduleFromHistory(historyId) {
    const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    if (currentUser?.role !== 'admin') {
      alert('일정 복원은 관리자만 할 수 있습니다.');
      return;
    }
    if (!confirm('이 이력 시점의 일정 상태로 복원하시겠습니까? 현재 일정 정보는 새 변경 이력으로 보존됩니다.')) return;

    const { data: log, error: historyError } = await sbClient
      .from('schedule_history')
      .select('*')
      .eq('id', historyId)
      .single();
    if (historyError || !log?.snapshot || !log.schedule_id) {
      alert('복원할 이력 정보를 찾지 못했습니다.');
      return;
    }

    const fields = ['branch', 'student_name', 'coach_name', 'subject', 'room_name', 'start_time', 'end_time', 'total_sessions', 'session_no', 'schedule_type', 'phone', 'consult_status', 'memo', 'schedule_status', 'recurrence_group_id'];
    const restoredPayload = Object.fromEntries(fields.filter(key => key in log.snapshot).map(key => [key, log.snapshot[key]]));
    if (!restoredPayload.start_time || !restoredPayload.end_time) {
      alert('이 이력에는 복원할 일정 시간이 없습니다.');
      return;
    }

    const { data: currentSchedule, error: currentError } = await sbClient
      .from('schedules')
      .select('*')
      .eq('id', log.schedule_id)
      .maybeSingle();
    if (currentError) {
      alert('현재 일정을 확인하지 못했습니다: ' + currentError.message);
      return;
    }

    try {
      await assertNoScheduleConflict([restoredPayload], currentSchedule ? [log.schedule_id] : []);
    } catch (error) {
      alert(`복원할 수 없습니다: ${error.message}`);
      return;
    }

    let saveError;
    if (currentSchedule) {
      ({ error: saveError } = await sbClient.from('schedules').update(restoredPayload).eq('id', log.schedule_id));
    } else {
      ({ error: saveError } = await sbClient.from('schedules').insert([{ ...restoredPayload, id: log.schedule_id }]));
    }
    if (saveError) {
      alert('일정 복원 실패: ' + saveError.message);
      return;
    }

    await writeScheduleHistory('restored', { ...restoredPayload, id: log.schedule_id }, `${formatScheduleForHistory(restoredPayload)} 이력 시점으로 복원`);
    alert('일정이 선택한 이력 시점으로 복원되었습니다.');
    await loadScheduleHistory();
    if (calendar) calendar.refetchEvents();
  }

  async function saveSchedule() {
    const id = document.getElementById('scheduleId').value;
    const unassignedDbId = document.getElementById('currentUnassignedDbId').value;
    const totalSessionsVal = parseInt(document.getElementById('modalTotalSessions').value, 10) || 1;
    const sessionNoVal = parseInt(document.getElementById('modalSessionNo').value, 10) || 1;
    
    const branch = document.getElementById('modalBranch').value;
    const student_name = document.getElementById('modalStudentName').value.trim();
    
    const currentUser = JSON.parse(sessionStorage.getItem('loginUser'));
    const coach_name = (currentScheduleType === 'practice') ? '연습실' : ((currentUser && currentUser.role !== 'admin') ? currentUser.name : document.getElementById('modalCoachName').value);
    
    const subject = document.getElementById('modalSubject').value;
    const room_name = currentScheduleType === 'consulting' ? '상담실' : (document.getElementById('modalRoomName')?.value || '연습실');
    
    const selectedDate = document.getElementById('modalDate').value;
    const startTime = document.getElementById('modalStartTime').value;
    const endTime = document.getElementById('modalEndTime').value;

    const phone = document.getElementById('modalPhone')?.value.trim() || '';
    const consult_status = document.getElementById('modalConsultStatus')?.value || '';
    const memo = document.getElementById('modalMemo')?.value.trim() || '';
    const schedule_status = currentScheduleType === 'lesson' ? document.getElementById('modalScheduleStatus').value : 'scheduled';
    const recurrence_group_id = document.getElementById('recurrenceGroupId').value || null;

    const isRepeat = document.getElementById('repeatScheduleCheck')?.checked;
    const repeatWeeks = parseInt(document.getElementById('repeatWeeksSelect')?.value, 10) || 1;

    if (!student_name || !selectedDate || !startTime || !endTime) {
      alert("이름, 날짜 및 시간을 정확히 입력해 주세요.");
      return;
    }

    if (startTime >= endTime) {
      alert("종료 시간은 시작 시간보다 이후여야 합니다.");
      return;
    }

    if (currentScheduleType === 'lesson' && (sessionNoVal < 1 || sessionNoVal > totalSessionsVal)) {
      alert('시작 회차는 1회차부터 총 회차 이내로 설정해 주세요.');
      return;
    }

    const duration = DURATION_MAP[subject] || 60;
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const timeUnit = currentScheduleType === 'consulting' ? 10 : 30;
    if (startMinute % timeUnit !== 0) {
      alert(`${currentScheduleType === 'consulting' ? '상담' : '레슨/연습실'} 시작 시간은 ${timeUnit}분 단위로 입력해 주세요.`);
      return;
    }
    if (currentScheduleType === 'practice' && ((startHour * 60) + startMinute + duration > (23 * 60))) {
      alert('연습실 이용은 운영 마감 시간인 23:00 이전에 끝나도록 시작 시간을 선택해 주세요.');
      return;
    }

    const start_time = `${selectedDate}T${startTime}:00+09:00`;
    const end_time = `${selectedDate}T${endTime}:00+09:00`;

    const payload = { 
      branch, 
      student_name, 
      coach_name, 
      subject, 
      room_name, 
      start_time, 
      end_time, 
      total_sessions: totalSessionsVal,
      session_no: currentScheduleType === 'lesson' ? sessionNoVal : 1,
      schedule_type: currentScheduleType,
      phone,
      consult_status,
      memo,
      schedule_status,
      recurrence_group_id
    };

    if (id) {
      const applyToFuture = currentScheduleType === 'lesson'
        && document.getElementById('applyToFutureSeriesCheck')?.checked
        && recurrence_group_id;
      let updates = [{ id, payload }];

      if (applyToFuture) {
        const { data: futureSchedules, error: futureError } = await sbClient
          .from('schedules')
          .select('*')
          .eq('recurrence_group_id', recurrence_group_id)
          .gt('start_time', originalScheduleData.start_time)
          .order('start_time', { ascending: true });
        if (futureError) {
          alert('반복 일정 불러오기 실패: ' + futureError.message);
          return;
        }
        updates = updates.concat((futureSchedules || []).map(existing => {
          const date = formatKST(existing.start_time).date;
          return {
            id: existing.id,
            payload: {
              ...payload,
              start_time: `${date}T${startTime}:00+09:00`,
              end_time: `${date}T${endTime}:00+09:00`,
              recurrence_group_id: existing.recurrence_group_id,
              session_no: existing.session_no,
              schedule_status: existing.schedule_status
            }
          };
        }));
      }
      try {
        await assertNoScheduleConflict(updates.map(item => item.payload), updates.map(item => item.id));
      } catch (error) {
        alert(`저장할 수 없습니다: ${error.message}`);
        return;
      }
      for (const update of updates) {
        const result = await sbClient.from('schedules').update(update.payload).eq('id', update.id);
        if (result.error) {
          alert("수정 실패: " + result.error.message);
          return;
        }
      }
      {
        const changedFields = getChangedFields(originalScheduleData, payload);
        await writeScheduleHistory(
          'updated',
          { ...payload, id },
          `${formatScheduleForHistory(originalScheduleData)} → ${changedFields.length ? changedFields.join(', ') + ' 변경' : '일정 정보 수정'}${applyToFuture ? ` (이후 ${updates.length - 1}회차에도 적용)` : ''}`
        );
        const modalEl = document.getElementById('scheduleModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        calendar.refetchEvents();
      return;
      }
    }

    const weeksToCreate = (currentScheduleType === 'lesson' && isRepeat) ? repeatWeeks : 1;
    if (currentScheduleType === 'lesson' && sessionNoVal + weeksToCreate - 1 > totalSessionsVal) {
      alert(`반복 생성 시 ${totalSessionsVal}회차를 넘습니다. 시작 회차 또는 생성 횟수를 조정해 주세요.`);
      return;
    }
    const newRecurrenceGroupId = (currentScheduleType === 'lesson' && isRepeat) ? createRecurrenceGroupId() : null;
    const schedulesToInsert = [];
    const baseDate = new Date(selectedDate);

    for (let i = 0; i < weeksToCreate; i++) {
      const currDateObj = new Date(baseDate);
      currDateObj.setDate(baseDate.getDate() + (i * 7));
      const currDateStr = formatDateIso(currDateObj);

      schedulesToInsert.push({ 
        ...payload,
        recurrence_group_id: newRecurrenceGroupId,
        session_no: currentScheduleType === 'lesson' ? sessionNoVal + i : 1,
        start_time: `${currDateStr}T${startTime}:00+09:00`,
        end_time: `${currDateStr}T${endTime}:00+09:00`
      });
    }

    try {
      await assertNoScheduleConflict(schedulesToInsert);
    } catch (error) {
      alert(`저장할 수 없습니다: ${error.message}`);
      return;
    }

    const { data: insertedSchedules, error: insertError } = await sbClient.from('schedules').insert(schedulesToInsert).select();

    if (insertError) {
      if (insertError.message?.includes('schedules_schedule_status_check')) {
        alert('보강 상태를 저장하려면 Supabase SQL Editor에서 supabase-보강상태-단순화.sql을 한 번 실행해 주세요.');
      } else {
        alert("일정 저장 실패: " + insertError.message);
      }
    } else {
      for (const schedule of insertedSchedules || schedulesToInsert) {
        await writeScheduleHistory('created', schedule, `${formatScheduleForHistory(schedule)} 일정 추가`);
      }
      if (unassignedDbId) {
        await sbClient.from('unassigned_students').delete().eq('id', unassignedDbId);
        await loadUnassignedStudents();
      }

      alert('스케줄이 성공적으로 저장되었습니다.');

      const modalEl = document.getElementById('scheduleModal');
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      calendar.refetchEvents();
    }
  }

  async function deleteSchedule() {
    const id = document.getElementById('scheduleId').value;
    if (!id || !confirm("이 일정을 취소 처리하시겠습니까? 취소 기록은 보존되며 나중에 상태를 다시 변경할 수 있습니다.")) return;

    const cancelFuture = Boolean(originalScheduleData?.recurrence_group_id)
      && document.getElementById('cancelFutureSeriesCheck')?.checked;
    let cancelQuery = sbClient.from('schedules').update({ schedule_status: 'cancelled' });
    if (cancelFuture) {
      cancelQuery = cancelQuery
        .eq('recurrence_group_id', originalScheduleData.recurrence_group_id)
        .gte('start_time', originalScheduleData.start_time);
    } else {
      cancelQuery = cancelQuery.eq('id', id);
    }
    const { error: cancelError } = await cancelQuery;
    if (cancelError) {
      alert("취소 처리 실패: " + cancelError.message);
      return;
    }

    // 취소한 수업은 다시 날짜를 잡을 수 있도록 미정 목록으로 되돌립니다.
    // 반복 일정을 함께 취소해도 기준이 되는 한 명만 미정으로 등록합니다.
    const schedule = originalScheduleData || { id };
    const unassignedPayload = {
      branch: schedule.branch,
      name: schedule.student_name || '미정',
      phone: schedule.phone || '',
      coach: schedule.coach_name || '',
      subject: schedule.subject || '스타일',
      room: schedule.room_name || 'ROOM 1',
      total_sessions: schedule.total_sessions || 1,
      start_session_no: schedule.session_no || 1,
      completed_sessions: 0,
      remaining_sessions: Math.max(1, (schedule.total_sessions || 1) - ((schedule.session_no || 1) - 1)),
      schedule_type: schedule.schedule_type || 'lesson',
      management_status: 'pending',
      hold_reason: null,
      resume_date: null
    };
    let { error: moveError } = await sbClient.from('unassigned_students').insert([unassignedPayload]);
    if (moveError?.message?.includes('start_session_no')) {
      const { start_session_no: _startSessionNo, ...legacyUnassignedPayload } = unassignedPayload;
      ({ error: moveError } = await sbClient.from('unassigned_students').insert([legacyUnassignedPayload]));
    }
    if (moveError) {
      alert('일정은 취소됐지만 미정 목록 이동에 실패했습니다: ' + moveError.message);
      calendar.refetchEvents();
      return;
    }

    await writeScheduleHistory('updated', originalScheduleData || { id }, `${formatScheduleForHistory(originalScheduleData)}${cancelFuture ? ' 및 이후 반복 일정' : ''} 취소 처리`);

    alert(cancelFuture ? "선택한 일정과 이후 반복 일정이 취소되고 미정 목록으로 이동했습니다." : "일정이 취소되고 미정 목록으로 이동했습니다.");

    const modalEl = document.getElementById('scheduleModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    await loadUnassignedStudents();
    calendar.refetchEvents();
  }

  async function registerNewCoach() {
    const checkedBranches = Array.from(document.querySelectorAll('.new-coach-branch:checked')).map(cb => cb.value);
    if (checkedBranches.length === 0) {
      alert('최소 하나 이상의 담당 지점을 선택해 주세요.');
      return;
    }

    const branch = checkedBranches.join(', ');
    const name = document.getElementById('newCoachName').value.trim();
    const email = document.getElementById('newCoachEmail').value.trim();
    const password = document.getElementById('newCoachPassword').value.trim();
    const role = document.getElementById('newCoachRole').value;
    const color = document.getElementById('newCoachColor').value;

    if (!name || !email || !password) {
      alert('코치 이름, 아이디, 비밀번호를 모두 입력해 주세요.');
      return;
    }

    const payload = { 
      branch, 
      name, 
      username: email,
      email: email, 
      password, 
      role, 
      color 
    };

    const { error } = await sbClient.from('coaches').insert([payload]);
    if (error) {
      alert('코치 등록 실패: ' + error.message);
    } else {
      alert(`${name} 코치(${branch})가 등록되었습니다.`);
      document.getElementById('newCoachName').value = '';
      document.getElementById('newCoachEmail').value = '';
      document.getElementById('newCoachPassword').value = '';
      await loadCoachesData();
    }
  }

  async function deleteCoach(id) {
    if (!confirm('정말 이 코치 계정을 삭제하시겠습니까?')) return;
    const { error } = await sbClient.from('coaches').delete().eq('id', id);
    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      await loadCoachesData();
    }
  }
