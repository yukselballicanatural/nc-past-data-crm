/**
 * Natural Clinic - Past Data CRM (2025-2026)
 * Core State Engine & Helper Library (localStorage Simulation)
 */

// User Database (loaded dynamically from Supabase)
let usersDatabase = [];
// 3. Initialize User System
// Static users deleted. Access is dynamically synchronized from Supabase Users table.
const cachedUsers = localStorage.getItem('nc_users');
if (cachedUsers) {
  try {
    usersDatabase = JSON.parse(cachedUsers);
  } catch (e) {
    usersDatabase = [];
  }
} else {
  usersDatabase = [];
}

// Manually defined Administrators
const ADMINS = ["Mertay Bey", "System Admin"];

// Manually mapped Team Leaders and their managed CSV Team names
const TEAM_LEADERS = {
  "Ali Ömer": "Ali Omer Team",
  "Ali Omer": "Ali Omer Team",
  "Ahmet": "Askif Team",
  "Bülent": "Vip Team - Morocco",
  "Cebrail": "Toumi Team",
  "Can Demir": "Ghazal Team",
  "Aamir Ali": "Aamir Ali Team",
  "Ahmed Anwar": "Ahmed Anwar Team",
  "Arij": "Arij  Team",
  "Arij Mahjoubi": "Arij  Team",
  "Askif": "Askif Team",
  "Farah": "Farah Team - Morocco",
  "Ghazal": "Ghazal Team",
  "Joel": "Joel Team",
  "Mihoubi": "Mihoubi Team",
  "Ramadan": "Ramadan Team - Morocco",
  "Sara": "Sara Team - Morocco",
  "Sara Aboulhaoun": "Sara Team - Morocco",
  "Selma": "Selma Team - Morocco",
  "Selma Bennani": "Selma Team - Morocco",
  "SM Amin Connor": "SM Amin Connor - Team",
  "SM- Mert": "SM- Mert Team",
  "Touma": "Touma Team",
  "Abdulkader Touma": "Touma Team",
  "Diğer": "Diğer"
};

// Clean/Normalize user role from database or manual maps
function getUserSessionInfo(usernameOrName, password) {
  const normalizedInput = usernameOrName.trim().toLowerCase();
  const rawPassword = String(password || '').trim();
  
  // Custom check for 'admin' username with password 'admin123'
  if (normalizedInput === 'admin') {
    if (rawPassword === 'admin123') {
      return {
        fullName: 'System Admin',
        username: 'admin',
        role: 'admin',
        team: 'All Teams'
      };
    } else {
      return {
        fullName: 'admin',
        role: 'invalid_password',
        team: 'System'
      };
    }
  }

  // 1. Direct fallback check for hardcoded ADMINS
  if (ADMINS.some(admin => admin.toLowerCase() === normalizedInput)) {
    if (rawPassword === '123' || rawPassword === 'admin123') {
      const correctName = ADMINS.find(admin => admin.toLowerCase() === normalizedInput);
      return {
        fullName: correctName,
        username: normalizedInput,
        role: 'admin',
        team: 'All Teams'
      };
    } else {
      return {
        fullName: normalizedInput,
        role: 'invalid_password',
        team: 'System'
      };
    }
  }
  
  // 2. Dynamic check in Users table loaded from Supabase with defensive checks
  const dbUser = usersDatabase.find(u => {
    if (!u) return false;
    const uName = String(u.username || '').toLowerCase().trim();
    const fName = String(u.fullName || '').toLowerCase().trim();
    return uName === normalizedInput || fName === normalizedInput;
  });
  
  if (dbUser) {
    const dbPass = String(dbUser.password || '').trim();
    if (dbPass === rawPassword) {
      let rawRole = String(dbUser.role || 'agent').toLowerCase().trim();
      let normalizedRole = 'agent';
      if (rawRole.includes('admin')) {
        normalizedRole = 'admin';
      } else if (rawRole.includes('regional') || rawRole.includes('rm') || rawRole.includes('manager')) {
        normalizedRole = 'regional-manager';
      } else if (rawRole.includes('leader') || rawRole.includes('tl')) {
        normalizedRole = 'team-leader';
      }
      
      return {
        fullName: dbUser.fullName,
        username: dbUser.username,
        role: normalizedRole,
        team: dbUser.team || dbUser.roleName
      };
    } else {
      return {
        fullName: dbUser.fullName,
        role: 'invalid_password',
        team: 'System'
      };
    }
  }
  
  return null;
}

// 4. Mock Deal Generation (40 Records matching metadata schema)
const regions = ['United Kingdom', 'Germany', 'France', 'United Arab Emirates', 'Spain', 'United States', 'Italy'];
const languages = ['English', 'German', 'French', 'Arabic', 'Spanish', 'Turkish', 'Italian'];
const stages = ['New Lead', 'Contacted', 'Follow-up Scheduled', 'In Negotiation', 'Deposit Paid'];
const patientNames = [
  'Liam Neeson', 'Olivia Dunham', 'Noah Bennet', 'Emma Watson', 'Oliver Queen',
  'Sophia Loren', 'Jackson Avery', 'Isabella Swan', 'Lucas Hood', 'Mia Toretto',
  'Harry Potter', 'Amelie Poulain', 'Filippo Inzaghi', 'Sarah Connor', 'John Connor',
  'Bruce Wayne', 'Diana Prince', 'Clark Kent', 'Selina Kyle', 'Arthur Dent',
  'Jane Eyre', 'Edward Rochester', 'Elizabeth Bennet', 'Fitzwilliam Darcy', 'David Copperfield',
  'James Bond', 'Sherlock Holmes', 'John Watson', 'Winston Smith', 'Julia Miller',
  'Thomas Shelby', 'Arthur Shelby', 'Grace Burgess', 'Alf Solomons', 'Luca Changretta',
  'Walter White', 'Jesse Pinkman', 'Skyler White', 'Gustavo Fring', 'Saul Goodman'
];

function generateMockDeals() {
  // Collect all agents from specific teams managed by the Team Leaders, plus some others
  const targetTeams = ["Ali Omer Team", "Askif Team", "Vip Team - Morocco", "Toumi Team", "Ghazal Team", "Aamir Ali Team"];
  const agents = usersDatabase.filter(u => u.role === 'agent' && targetTeams.includes(u.roleName));
  
  // Explicitly inject Test Agent to assign mock deals to them
  agents.push({
    fullName: 'Test Agent',
    roleName: 'Ali Omer Team',
    role: 'agent'
  });
  
  if (agents.length === 0) {
    // Fallback to all agents
    agents.push(...usersDatabase.filter(u => u.role === 'agent'));
  }
  
  const deals = [];
  
  for (let i = 0; i < 40; i++) {
    // Pick random values
    const dealIdZoho = (645008000120000000 + Math.floor(Math.random() * 999999)).toString();
    const customId = `#${1000 + Math.floor(Math.random() * 9000)}-${Math.floor(Math.random() * 90000)}`;
    const patientName = patientNames[i % patientNames.length];
    const year = Math.random() > 0.5 ? '2025' : '2026';
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    const arrivalDate = `${year}-${month}-${day}`;
    const region = regions[Math.floor(Math.random() * regions.length)];
    const language = languages[Math.floor(Math.random() * languages.length)];
    const stage = stages[Math.floor(Math.random() * stages.length)];
    
    // Assign to a random agent
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const ownerName = agent.fullName;
    const teamName = agent.roleName;
    
    // Set some deals as already locked to show initial state
    let status = 'pending';
    let resultCode = null;
    let agentNote = null;
    
    if (i < 8) {
      status = 'locked';
      const resultCodes = ['BUSY', 'NO_ANSWER', 'NOT_INTERESTED', 'POTENTIAL_HOT', 'BOOKED', 'FOLLOW_UP', 'PRICE_HIGH'];
      resultCode = resultCodes[i % resultCodes.length];
      agentNote = `Initial mock call logged. Customer spoke about hair transplant. Checked region is ${region}.`;
    }
    
    deals.push({
      id: 'deal_' + i + '_' + Date.now(),
      deal_id_zoho: dealIdZoho,
      custom_id: customId,
      deal_name: patientName,
      arrival_date: arrivalDate,
      region: region,
      language: language,
      stage: stage,
      owner_name: ownerName,
      team_name: teamName,
      status: status,
      result_code: resultCode,
      agent_note: agentNote,
      lock_approval_requested: false
    });
  }
  
  deals.unshift(...DALIA_EXCEL_LEADS);
  localStorage.setItem('nc_deals', JSON.stringify(deals));
  
  // Write initial audit logs
  const systemLogs = [
    {
      id: 'log_init',
      user: 'System Admin',
      action: 'SYSTEM_INITIALIZATION',
      deal_id: null,
      deal_name: null,
      details: 'Mock database successfully generated with 40 records.',
      timestamp: new Date().toISOString()
    }
  ];
  localStorage.setItem('nc_logs', JSON.stringify(systemLogs));
}

const DALIA_EXCEL_LEADS = [
  {
    "id": "deal_dalia_0_1781709239600",
    "deal_id_zoho": "645008000947444971",
    "custom_id": "0426-50459",
    "deal_name": "Mr Shan Aesthetics Deal",
    "arrival_date": "2026-04-06",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_1_1781709239600",
    "deal_id_zoho": "645008000939043052",
    "custom_id": "0326-50318",
    "deal_name": "Sinead Higgins Dental Deal",
    "arrival_date": "2026-04-10",
    "region": "Istanbul",
    "language": "English",
    "stage": "Cancelled",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_2_1781709239600",
    "deal_id_zoho": "645008000963374189",
    "custom_id": "0426-50613",
    "deal_name": "Ms Tanya Dental Deal",
    "arrival_date": "2026-04-13",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_3_1781709239600",
    "deal_id_zoho": "645008000997586117",
    "custom_id": "0426-50925",
    "deal_name": "Aileen O,donovan Dental Deal",
    "arrival_date": "2026-04-25",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_4_1781709239600",
    "deal_id_zoho": "645008000943975726",
    "custom_id": "0426-50403",
    "deal_name": "Danielle Toni Dental Deal",
    "arrival_date": "2026-04-28",
    "region": "Istanbul",
    "language": "English",
    "stage": "Cancelled",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_5_1781709239600",
    "deal_id_zoho": "645008001018788217",
    "custom_id": "0526-51143",
    "deal_name": "Bazza Bazza Dental Deal",
    "arrival_date": "2026-05-02",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_6_1781709239600",
    "deal_id_zoho": "645008000950244356",
    "custom_id": "0426-50510",
    "deal_name": "lellis lellis Dental Deal",
    "arrival_date": "2026-05-11",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_7_1781709239600",
    "deal_id_zoho": "645008001065021090",
    "custom_id": "0626-52286",
    "deal_name": "Sheila Douglas' Deal (Dental)",
    "arrival_date": "2026-06-16",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_8_1781709239600",
    "deal_id_zoho": "645008000941843017",
    "custom_id": "0426-50373",
    "deal_name": "Ben Foster' Deal (Dental)",
    "arrival_date": "2026-04-01",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_9_1781709239600",
    "deal_id_zoho": "645008001006137970",
    "custom_id": "0426-50953",
    "deal_name": "Ferhat Sanci Dental Deal",
    "arrival_date": "2026-04-27",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_10_1781709239600",
    "deal_id_zoho": "645008000893886593",
    "custom_id": "0226-49650",
    "deal_name": "Momodou Lamin Jallow' Deal (Dental)",
    "arrival_date": "2026-02-23",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_11_1781709239600",
    "deal_id_zoho": "645008001006232075",
    "custom_id": "0426-50952",
    "deal_name": "Alex Shev Dental Deal",
    "arrival_date": "2026-06-02",
    "region": "Istanbul",
    "language": "English",
    "stage": "Waiting appointment",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_12_1781709239600",
    "deal_id_zoho": "645008000994055148",
    "custom_id": "0426-50869",
    "deal_name": "Rebeka Ionela Bortan. Aesthetics Deal",
    "arrival_date": "2026-04-23",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_13_1781709239600",
    "deal_id_zoho": "645008000892271552",
    "custom_id": "0226-49619",
    "deal_name": "Sohail Khan' Deal (Dental)",
    "arrival_date": "2026-04-28",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_14_1781709239600",
    "deal_id_zoho": "645008000953753515",
    "custom_id": "0426-50539",
    "deal_name": "Ms Sidra Dental Deal",
    "arrival_date": "2026-04-10",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_15_1781709239600",
    "deal_id_zoho": "645008001009928165",
    "custom_id": "0426-51025",
    "deal_name": "Syeda Gülsüm Dental Deal",
    "arrival_date": "2026-04-28",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_16_1781709239600",
    "deal_id_zoho": "645008001019216948",
    "custom_id": "0526-51164",
    "deal_name": "mr raees' Deal (Aesthetics)",
    "arrival_date": "2026-05-04",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_17_1781709239600",
    "deal_id_zoho": "645008000938521883",
    "custom_id": "0326-50310",
    "deal_name": "Linda Whiteley' Deal (Aesthetics)",
    "arrival_date": "2026-03-30",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_18_1781709239600",
    "deal_id_zoho": "645008000995800355",
    "custom_id": "0426-50895",
    "deal_name": "Tahir bahoo' Deal (Dental)",
    "arrival_date": "2026-04-24",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_19_1781709239600",
    "deal_id_zoho": "645008000975878521",
    "custom_id": "0426-50689",
    "deal_name": "Desislava Vasileva Aesthetics Deal",
    "arrival_date": "2026-04-15",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_20_1781709239600",
    "deal_id_zoho": "645008000680027040",
    "custom_id": "1125-47232",
    "deal_name": "Johannes Lechner Hair Deal",
    "arrival_date": "2025-12-25",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_21_1781709239600",
    "deal_id_zoho": "645008000909481448",
    "custom_id": "0326-49917",
    "deal_name": "Ms. Jenny' Deal (Dental)",
    "arrival_date": "2026-03-07",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_22_1781709239600",
    "deal_id_zoho": "645008000367478959",
    "custom_id": "0325-42201",
    "deal_name": "PARVANEH SAGHARI' Deal (Dental)",
    "arrival_date": "2025-03-07",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_23_1781709239600",
    "deal_id_zoho": "645008000677927765",
    "custom_id": "1125-47187",
    "deal_name": "Kirlianit Cortes-Galvez' Deal (Hair)",
    "arrival_date": "2025-12-25",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_24_1781709239600",
    "deal_id_zoho": "645008000895385175",
    "custom_id": "0226-49671",
    "deal_name": "Davis A' Deal (Dental)",
    "arrival_date": "2026-03-06",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_25_1781709239600",
    "deal_id_zoho": "645008000931086105",
    "custom_id": "0326-50183",
    "deal_name": "Lenka Conkova Dental Deal",
    "arrival_date": "2026-04-15",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_26_1781709239600",
    "deal_id_zoho": "645008000722804044",
    "custom_id": "1225-47899",
    "deal_name": "Hussnain Chaudray' Deal (Hair)",
    "arrival_date": "2026-06-04",
    "region": "Istanbul",
    "language": "English",
    "stage": "Waiting appointment",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_27_1781709239600",
    "deal_id_zoho": "645008001049741172",
    "custom_id": "0526-51670",
    "deal_name": "Ms Esmer Dental Deal",
    "arrival_date": "2026-06-03",
    "region": "Istanbul",
    "language": "English",
    "stage": "Waiting appointment",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_28_1781709239600",
    "deal_id_zoho": "645008001054794284",
    "custom_id": "0626-51864",
    "deal_name": "VIKTORIIA MIKULINTSEVA' Deal (Dental)",
    "arrival_date": "2026-06-03",
    "region": "Istanbul",
    "language": "Russian",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_29_1781709239600",
    "deal_id_zoho": "645008000722801071",
    "custom_id": "1225-47898",
    "deal_name": "Arshid Chaudary' Deal (Hair)",
    "arrival_date": "2026-06-04",
    "region": "Istanbul",
    "language": "English",
    "stage": "Waiting appointment",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_30_1781709239600",
    "deal_id_zoho": "645008000931019524",
    "custom_id": "0326-50184",
    "deal_name": "Tomas Stojka Hair Deal",
    "arrival_date": "2026-04-15",
    "region": "Istanbul",
    "language": "English",
    "stage": "Won",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_31_1781709239600",
    "deal_id_zoho": "645008001018765025",
    "custom_id": "0526-51138",
    "deal_name": "RAHIM GINA L' Deal (Hair)",
    "arrival_date": "2026-05-02",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_32_1781709239600",
    "deal_id_zoho": "645008000975906354",
    "custom_id": "0426-50690",
    "deal_name": "Stacy Taljaard Aesthetics Deal",
    "arrival_date": "2026-05-10",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_33_1781709239600",
    "deal_id_zoho": "645008000944001996",
    "custom_id": "0426-50404",
    "deal_name": "mR. Goncalo de Freitas Dental Deal",
    "arrival_date": "2026-04-28",
    "region": "Istanbul",
    "language": "English",
    "stage": "Waiting appointment",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  },
  {
    "id": "deal_dalia_34_1781709239600",
    "deal_id_zoho": "645008001063200520",
    "custom_id": "0626-52210",
    "deal_name": "Jnagir Jasim Dental Deal",
    "arrival_date": "2026-06-16",
    "region": "Istanbul",
    "language": "English",
    "stage": "Reservation Pending",
    "owner_name": "Dalia Adam",
    "team_name": "Aamir Ali Team",
    "status": "pending",
    "result_code": null,
    "agent_note": null,
    "lock_approval_requested": false
  }
];

// Initialize Supabase Client
const SUPABASE_URL = "https://aztxfncqanrodbttywrb.supabase.co";
const SUPABASE_KEY = "sb_publishable_IkbCNelsIjBPW6Tqkq4Egw_djjzvTXL";
let supabase = null;

if (typeof window !== 'undefined' && window.supabase) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Background Supabase Sync Helper
async function syncSupabaseData() {
  if (!supabase) return;
  try {
    // 1. Fetch raw deals from Supabase Raw-Data table
    const { data: rawDeals, error: rawError } = await supabase.from('Raw-Data').select('*');
    if (!rawError && rawDeals && rawDeals.length > 0) {
      // Map Raw-Data rows to our internal deal model
      const mappedDeals = rawDeals.map((row, idx) => {
        const dealId = String(row["db.Deal Id"] || row.id || ('deal_' + idx));
        const localCached = JSON.parse(localStorage.getItem('nc_deals') || '[]').find(d => d.id === dealId);
        
        return {
          id: dealId,
          deal_id_zoho: String(row["db.Deal Id"] || ''),
          custom_id: String(row["db.DealID"] || ''),
          deal_name: String(row["db.Deal Name"] || ''),
          arrival_date: String(row["db.Arrival Date"] || ''),
          region: String(row["db.Region"] || ''),
          language: String(row["db.Language"] || ''),
          stage: String(row["db.Stage"] || ''),
          owner_name: String(row["db.Deal Owner Name"] || ''),
          team_name: String(row["db.Role Name"] || ''),
          status: localCached ? localCached.status : 'pending',
          result_code: localCached ? localCached.result_code : null,
          agent_note: localCached ? localCached.agent_note : null,
          lock_approval_requested: localCached ? localCached.lock_approval_requested : false
        };
      });
      localStorage.setItem('nc_deals', JSON.stringify(mappedDeals));
      if (typeof syncAndRender === 'function') {
        syncAndRender();
      }
      if (typeof loadWorkspaceData === 'function') {
        loadWorkspaceData();
      }
    } else {
      // Fallback: try fetching from deals table
      const { data: dealsData, error: dealsError } = await supabase.from('deals').select('*');
      if (!dealsError && dealsData && dealsData.length > 0) {
        localStorage.setItem('nc_deals', JSON.stringify(dealsData));
        if (typeof syncAndRender === 'function') {
          syncAndRender();
        }
        if (typeof loadWorkspaceData === 'function') {
          loadWorkspaceData();
        }
      }
    }

    // 2. Fetch logs from Supabase
    const { data: logsData, error: logsError } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(500);
    if (!logsError && logsData) {
      if (logsData.length === 0) {
        const localLogs = JSON.parse(localStorage.getItem('nc_logs') || '[]');
        if (localLogs.length > 0) {
          await supabase.from('audit_logs').insert(localLogs);
        }
      } else {
        localStorage.setItem('nc_logs', JSON.stringify(logsData));
        if (typeof syncAndRender === 'function') {
          syncAndRender();
        }
      }
    }

    // 3. Fetch users from Supabase Users table
    const { data: usersData, error: usersError } = await supabase.from('Users').select('*');
    if (!usersError && usersData) {
      if (usersData.length > 0) {
        usersDatabase = usersData.map(u => {
          let rawRole = String(u['Role'] || u.role || 'agent').toLowerCase().trim();
          let normalizedRole = 'agent';
          if (rawRole.includes('admin')) {
            normalizedRole = 'admin';
          } else if (rawRole.includes('regional') || rawRole.includes('rm') || rawRole.includes('manager')) {
            normalizedRole = 'regional-manager';
          } else if (rawRole.includes('leader') || rawRole.includes('tl')) {
            normalizedRole = 'team-leader';
          }
          return {
            fullName: u['Deal Owner Name'] || u.fullName || '',
            roleName: u['Takim Adi'] || u.roleName || '',
            role: normalizedRole,
            username: u['Username'] || u.username || '',
            password: u['Password'] || u.password || '',
            team: u['Takim Adi'] || u.team || u.roleName || ''
          };
        });
        localStorage.setItem('nc_users', JSON.stringify(usersDatabase));
        window.USERS_LIST = usersDatabase;
        console.log('Successfully loaded users directory from Supabase.');
      } else {
        console.log('Supabase Users table is empty.');
      }
    }
  } catch (e) {
    console.warn('Supabase initial sync failed or tables not present.', e);
  }
}

// Initialize LocalStorage Data - skip mock deals, use Supabase Raw-Data as source
// (Deals will be loaded from Supabase Raw-Data table by syncSupabaseData)
if (!localStorage.getItem('nc_deals')) {
  localStorage.setItem('nc_deals', JSON.stringify([]));
}
if (!localStorage.getItem('nc_logs')) {
  localStorage.setItem('nc_logs', JSON.stringify([]));
}

// Sync with Supabase on start
if (supabase) {
  syncSupabaseData();
}

// 5. State Management Functions
const CRMStore = {
  getDeals: function() {
    return JSON.parse(localStorage.getItem('nc_deals') || '[]');
  },
  
  saveDeals: function(deals) {
    localStorage.setItem('nc_deals', JSON.stringify(deals));
  },
  
  getLogs: function() {
    return JSON.parse(localStorage.getItem('nc_logs') || '[]');
  },
  
  writeLog: function(user, action, dealId, dealName, details) {
    const logs = this.getLogs();
    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      user: user,
      action: action,
      deal_id: dealId,
      deal_name: dealName,
      details: details,
      timestamp: new Date().toISOString()
    };
    logs.unshift(logItem);
    if (logs.length > 500) logs.length = 500;
    localStorage.setItem('nc_logs', JSON.stringify(logs));
    
    // Background Supabase Log Insertion
    if (supabase) {
      supabase.from('audit_logs')
        .insert([logItem])
        .then(({ error }) => { if (error) console.error('Supabase writeLog error:', error); });
    }
  },
  
  // Action: Submit Call Result by Agent
  submitDealResult: function(dealId, resultCode, note, currentUser) {
    const deals = this.getDeals();
    const dealIndex = deals.findIndex(d => d.id === dealId);
    if (dealIndex === -1) return { success: false, message: 'Deal not found.' };
    
    const deal = deals[dealIndex];
    if (deal.status === 'locked') return { success: false, message: 'Deal is locked.' };
    
    deal.result_code = resultCode;
    deal.agent_note = note;
    deal.status = 'locked';
    deal.lock_approval_requested = false;
    
    this.saveDeals(deals);
    this.writeLog(
      currentUser.fullName,
      'RESULT_ENTERED',
      dealId,
      deal.deal_name,
      `Entered result code [${resultCode}] with note: "${note}"`
    );
    
    // Background Supabase update
    if (supabase) {
      supabase.from('deals')
        .update({ result_code: resultCode, agent_note: note, status: 'locked', lock_approval_requested: false })
        .eq('id', dealId)
        .then(({ error }) => { if (error) console.error('Supabase submitDealResult error:', error); });
    }
    
    return { success: true, deal: deal };
  },
  
  // Action: Request Unlock by Agent
  requestDealUnlock: function(dealId, currentUser) {
    const deals = this.getDeals();
    const dealIndex = deals.findIndex(d => d.id === dealId);
    if (dealIndex === -1) return { success: false, message: 'Deal not found.' };
    
    const deal = deals[dealIndex];
    deal.lock_approval_requested = true;
    
    this.saveDeals(deals);
    this.writeLog(
      currentUser.fullName,
      'UNLOCK_REQUESTED',
      dealId,
      deal.deal_name,
      `Requested card unlock for deal ${deal.custom_id}`
    );
    
    // Background Supabase update
    if (supabase) {
      supabase.from('deals')
        .update({ lock_approval_requested: true })
        .eq('id', dealId)
        .then(({ error }) => { if (error) console.error('Supabase requestDealUnlock error:', error); });
    }
    
    return { success: true, deal: deal };
  },
  
  // Action: Approve Unlock by TL or Admin
  approveDealUnlock: function(dealId, approverUser) {
    const deals = this.getDeals();
    const dealIndex = deals.findIndex(d => d.id === dealId);
    if (dealIndex === -1) return { success: false, message: 'Deal not found.' };
    
    const deal = deals[dealIndex];
    const previousResult = deal.result_code;
    
    deal.status = 'pending';
    deal.result_code = null;
    deal.agent_note = null;
    deal.lock_approval_requested = false;
    
    this.saveDeals(deals);
    this.writeLog(
      approverUser.fullName,
      'UNLOCK_APPROVED',
      dealId,
      deal.deal_name,
      `Approved card unlock. Reset result code [${previousResult}] back to pending.`
    );
    
    // Background Supabase update
    if (supabase) {
      supabase.from('deals')
        .update({ status: 'pending', result_code: null, agent_note: null, lock_approval_requested: false })
        .eq('id', dealId)
        .then(({ error }) => { if (error) console.error('Supabase approveDealUnlock error:', error); });
    }
    
    return { success: true, deal: deal };
  },
  
  // Reset System State
  resetSystemState: function() {
    localStorage.removeItem('nc_deals');
    localStorage.removeItem('nc_logs');
    generateMockDeals();
    
    // Background Supabase reset
    if (supabase) {
      Promise.all([
        supabase.from('deals').delete().neq('id', ''),
        supabase.from('audit_logs').delete().neq('id', '')
      ]).then(() => {
        const localDeals = JSON.parse(localStorage.getItem('nc_deals') || '[]');
        const localLogs = JSON.parse(localStorage.getItem('nc_logs') || '[]');
        supabase.from('deals').insert(localDeals);
        supabase.from('audit_logs').insert(localLogs);
      }).catch(err => console.error('Supabase resetSystemState error:', err));
    }
    return true;
  }
};

// 6. Security Routines & Session Guards
const AuthGuard = {
  login: async function(fullName, password) {
    // If usersDatabase is empty on start, attempt to fetch from Supabase dynamically
    if (usersDatabase.length === 0 && supabase) {
      try {
        const { data: usersData, error } = await supabase.from('Users').select('*');
        if (!error && usersData && usersData.length > 0) {
          usersDatabase = usersData.map(u => ({
            fullName: u['Deal Owner Name'] || u.fullName || '',
            roleName: u['Takim Adi'] || u.roleName || '',
            role: u['Role'] || u.role || '',
            username: u['Username'] || u.username || '',
            password: u['Password'] || u.password || '',
            team: u['Takim Adi'] || u.team || u.roleName || ''
          }));
          localStorage.setItem('nc_users', JSON.stringify(usersDatabase));
          window.USERS_LIST = usersDatabase;
        }
      } catch (e) {
        console.error("On-the-fly Supabase login check error:", e);
      }
    }

    const userInfo = getUserSessionInfo(fullName, password);
    if (!userInfo) {
      return { success: false, message: "User not found in system directory. Please wait for initial database sync or verify the username/password." };
    }
    if (userInfo.role === 'invalid_password') {
      return { success: false, message: "Incorrect password entered." };
    }
    if (userInfo.role === 'unauthorized') {
      return { success: false, message: `Access denied. Role "${userInfo.team}" is not authorized for CRM.` };
    }
    
    localStorage.setItem('nc_current_user', JSON.stringify(userInfo));
    
    // Log user log-in
    CRMStore.writeLog(userInfo.fullName, 'USER_LOGIN', null, null, `Logged into system as ${userInfo.role}`);
    
    return { success: true, user: userInfo };
  },
  
  logout: function() {
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      CRMStore.writeLog(currentUser.fullName, 'USER_LOGOUT', null, null, `Logged out from system`);
    }
    localStorage.removeItem('nc_current_user');
    window.location.href = 'index.html';
  },
  
  getCurrentUser: function() {
    const userStr = localStorage.getItem('nc_current_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch(e) {
      return null;
    }
  },
  
  protectPage: function(allowedRoles) {
    const currentUser = this.getCurrentUser();
    if (!currentUser) {
      window.location.href = 'index.html';
      return null;
    }
    if (!allowedRoles.includes(currentUser.role)) {
      // Role mismatch, bounce to their proper dashboard or logout
      if (currentUser.role === 'agent') {
        window.location.href = 'agent.html';
      } else if (currentUser.role === 'team-leader' || currentUser.role === 'regional-manager') {
        window.location.href = 'team-leader.html';
      } else if (currentUser.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        this.logout();
      }
      return null;
    }
    return currentUser;
  },

  canViewTeam: function(currentUser, teamName) {
    if (!currentUser) return false;
    const role = currentUser.role.toLowerCase();
    if (role === 'admin') return true;
    if (role === 'team-leader') return teamName === currentUser.team;
    if (role === 'regional-manager') {
      const username = (currentUser.username || '').toLowerCase();
      const name = (currentUser.fullName || '').toLowerCase();
      const normalizedTeam = (teamName || '').toLowerCase();
      if (username.includes('abderrahim') || name.includes('abderrahim') || username.includes('benmamar') || name.includes('benmamar')) {
        // Sees all except Morocco and Diğer
        return !normalizedTeam.includes('morocco') && !normalizedTeam.includes('diğer') && !normalizedTeam.includes('diger');
      }
      if (username.includes('manuel') || name.includes('manuel') || username.includes('gazzini') || name.includes('gazzini')) {
        // Sees all Morocco teams
        return normalizedTeam.includes('morocco');
      }
    }
    return false;
  },

  canViewDeal: function(currentUser, deal) {
    if (!currentUser) return false;
    const role = currentUser.role.toLowerCase();
    if (role === 'admin') return true;
    if (role === 'agent') {
      return (deal.owner_name || '').toLowerCase() === (currentUser.fullName || '').toLowerCase() ||
             (deal.owner_name || '').toLowerCase() === (currentUser.username || '').toLowerCase();
    }
    if (role === 'team-leader') {
      return deal.team_name === currentUser.team ||
             (deal.owner_name || '').toLowerCase() === (currentUser.fullName || '').toLowerCase();
    }
    if (role === 'regional-manager') {
      return this.canViewTeam(currentUser, deal.team_name);
    }
    return false;
  }
};

// Expose systems globally to share across HTML files
window.CRMStore = CRMStore;
window.AuthGuard = AuthGuard;
window.USERS_LIST = usersDatabase;

