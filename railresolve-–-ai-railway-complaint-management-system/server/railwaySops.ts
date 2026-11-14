export interface RailwaySopEntry {
  id: string;
  department: string;
  title: string;
  keywords: string[];
  guidance: string;
}

const RAILWAY_SOP_KB: RailwaySopEntry[] = [
  {
    id: 'SOP-MED-01',
    department: 'Medical',
    title: 'Onboard Medical Emergency & First-Aid Protocol',
    keywords: ['medical', 'chest pain', 'faint', 'unconscious', 'bleeding', 'doctor', 'heart', 'injury', 'ambulance', 'sick'],
    guidance:
      'Train Guard and TTE carry an onboard First-Aid & Medical Box (Coach A1/Guard Van). For acute medical emergencies, alert Divisional Railway Hospital and Station Master at the next major halt for stretcher & ambulance readiness, and coordinate Helpline 139.',
  },
  {
    id: 'SOP-SEC-02',
    department: 'Security/SOS',
    title: 'Meri Saheli & RPF Security Intervention SOP',
    keywords: ['harass', 'women', 'safety', 'sos', 'theft', 'robbery', 'assault', 'threat', 'rpf', 'grp', 'fight', 'suspicious'],
    guidance:
      'Under RPF Meri Saheli and Helpline 182 protocol, onboard RPF escort personnel must respond immediately to the passenger coach, verify safety, coordinate GRP FIR filing at the next junction if required, and stay with vulnerable passengers.',
  },
  {
    id: 'SOP-ELC-03',
    department: 'Electrical/AC',
    title: 'HVAC / AC Failure & TDR Refund Eligibility Rule',
    keywords: ['ac', 'cooling', 'heat', 'fan', 'light', 'charging', 'power', 'electrical', 'spark', 'smoke', 'short circuit'],
    guidance:
      'Onboard AC Mechanic / Electrical Escort inspects coach power relay and cooling vents. Under Indian Railways TDR Rules, if AC fails for a continuous stretch of journey without alternative accommodation, passengers are eligible for fare-difference refund by filing a TDR with TTE certificate.',
  },
  {
    id: 'SOP-HSK-04',
    department: 'Housekeeping',
    title: 'OBHS & Clean My Coach Sanitation Standard',
    keywords: ['washroom', 'toilet', 'dirty', 'clog', 'overflow', 'trash', 'garbage', 'water', 'clean', 'smell', 'housekeeping'],
    guidance:
      'On-Board Housekeeping Service (OBHS) staff must attend coach sanitation requests within 15–20 minutes while running. Heavy drain clogs or coach overhead tank refills are scheduled for the next watering/CTS station halt.',
  },
  {
    id: 'SOP-CAT-05',
    department: 'Catering',
    title: 'IRCTC Catering Hygiene & Meal Replacement SOP',
    keywords: ['food', 'stale', 'meal', 'catering', 'irctc', 'water bottle', 'overcharg', 'pantry', 'unhygienic'],
    guidance:
      'IRCTC Pantry Car Manager and Onboard Catering Inspector must inspect batch freshness, immediately replace any stale or unhygienic meal free of charge or issue a refund, and log a vendor quality penalty.',
  },
  {
    id: 'SOP-MNT-06',
    department: 'Coach Maintenance',
    title: 'Carriage & Wagon Mechanical Safety SOP',
    keywords: ['seat', 'berth', 'broken', 'door', 'window', 'lock', 'leak', 'coach', 'shutter'],
    guidance:
      'Carriage & Wagon (C&W) staff at the next maintenance pit/junction inspect broken berth chains, jammed vestibule doors, or window shutters. Open exterior doors while moving are flagged as safety priority.',
  },
];

export function retrieveRelevantSops(
  queryText: string,
  departmentHint?: string
): RailwaySopEntry[] {
  const q = `${queryText} ${departmentHint || ''}`.toLowerCase();

  const scored = RAILWAY_SOP_KB.map((entry) => {
    let score = 0;
    if (
      departmentHint &&
      entry.department.toLowerCase() === departmentHint.toLowerCase()
    ) {
      score += 5;
    }
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += 2;
    }
    return { entry, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return [RAILWAY_SOP_KB[3]];
  }
  return scored.slice(0, 2).map((s) => s.entry);
}
