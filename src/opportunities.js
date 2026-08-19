export const statusLabels = {
  open: 'Open Now',
  watching: 'Watching',
  expectedSoon: 'Opening Soon',
  deadlineSoon: 'Deadline Soon',
  verifyManually: 'Needs Confirmation',
};

export const confidenceLabels = {
  high: 'High Confidence',
  medium: 'Medium Confidence',
  needsReview: 'Needs Confirmation',
};

export const verificationLabels = {
  verified: 'Confirmed',
  watchOnly: 'Prep Only',
  needsReview: 'Needs Confirmation',
};

export const priorityLabels = {
  high: 'Recommended',
  watch: 'Recommended',
  foundation: 'Prep Resource',
};

export const alertReadinessLabels = {
  openNow: 'Apply Now',
  opensSoon: 'Prepare Now',
  watching: 'Watch for Opening',
  deadlineSoon: 'Deadline Soon',
  verify: 'Needs Confirmation',
  prepare: 'Prepare Now',
};

export const filterOptions = {
  roleTracks: ['Software Engineering', 'Product Management', 'Quant / Finance', 'Access & Prep'],
  priorities: Object.keys(priorityLabels),
  verification: Object.keys(verificationLabels),
  categories: [
    'Internship',
    'Externship / insight series',
    'Winternship',
    'Fellowship',
    'Internship-matching fellowship',
    'Scholarship',
    'Conference funding',
    'Technical community',
    'Training program',
    'Special program / resource',
  ],
  classYears: ['Freshman', 'Sophomore', 'All class years'],
  timing: ['Winter', 'Spring', 'Summer', 'Fall', 'Rolling'],
  status: Object.keys(statusLabels),
};

export function getOpportunityTracks(opportunity) {
  const signal = [
    opportunity.name,
    opportunity.organization,
    opportunity.category,
    opportunity.why,
    opportunity.prep,
    ...opportunity.tags,
  ]
    .join(' ')
    .toLowerCase();

  const tracks = new Set();

  if (signal.match(/product|pm|lifecycle|prototype|customer/)) {
    tracks.add('Product Management');
  }

  if (signal.match(/quant|trading|finance|fintech|bank|wall street|citadel|jane street|virtu/)) {
    tracks.add('Quant / Finance');
  }

  if (signal.match(/software|engineering|developer|technical|code|coding|open source|computer science|web|ai|cybersecurity|data/)) {
    tracks.add('Software Engineering');
  }

  if (
    signal.match(/scholarship|conference|community|mentorship|career prep|interview prep|training|resource|fellowship/)
  ) {
    tracks.add('Access & Prep');
  }

  return tracks.size ? Array.from(tracks) : ['Access & Prep'];
}

const repeatedProgramIds = new Set([
  'microsoft-explore-watch',
  'palantir-path-watch',
  'nasa-internships',
  'jane-street-fttp-watch',
  'virtu-womens-winternship-watch',
  'google-summer-of-code',
  'outreachy',
  'mlh-fellowship',
  'coding-it-forward-fellowship',
  'new-technologists-academy',
  'seo-tech-developer-core',
  'headstart-fellowship-watch',
  'jane-street-see-watch',
  'jpmorgan-career-ed-you-watch',
]);

export function getSourceSignal(opportunity) {
  const sourceText = `${opportunity.sourceNote} ${opportunity.tags.join(' ')}`.toLowerCase();
  const sourceNames = [];

  if (sourceText.includes('underclassmen')) {
    sourceNames.push('zapplyjobs');
  }

  if (
    sourceText.includes('luisa') ||
    sourceText.includes('repo section') ||
    sourceText.includes('fellowship section') ||
    sourceText.includes('opportunity-list')
  ) {
    sourceNames.push('LuisaE');
  }

  if (sourceText.includes('official')) {
    sourceNames.push('official source');
  }

  const sourceCount = repeatedProgramIds.has(opportunity.id) ? Math.max(sourceNames.length, 2) : Math.max(sourceNames.length, 1);

  return {
    count: sourceCount,
    label: sourceCount > 1 ? `Seen in ${sourceCount} sources` : 'Single discovery source',
  };
}

export function getVerificationState(opportunity) {
  if (opportunity.confidence === 'high' && opportunity.lastChecked) {
    return 'verified';
  }

  if (opportunity.confidence === 'needsReview' || opportunity.status === 'verifyManually') {
    return 'needsReview';
  }

  return 'watchOnly';
}

export function getMonitoringReadiness(opportunity) {
  const missing = [];
  const hasOfficialUrl = opportunity.url?.startsWith('https://');
  const hasCheckedDate = Boolean(opportunity.lastChecked);
  const hasActionableWindow =
    opportunity.openDate &&
    !opportunity.openDate.toLowerCase().includes('watch') &&
    !opportunity.openDate.toLowerCase().includes('verify');
  const hasDeadline =
    opportunity.deadline &&
    !opportunity.deadline.toLowerCase().includes('watch') &&
    !opportunity.deadline.toLowerCase().includes('verify') &&
    !opportunity.deadline.toLowerCase().includes('varies');
  const verificationState = getVerificationState(opportunity);
  const monitorSignal = getMonitorSignal(opportunity);
  const hasCurrentCycleTiming = Boolean(hasActionableWindow || hasDeadline);
  const sendsUsefulAlerts = !['Technical community', 'Special program / resource'].includes(opportunity.category);

  if (!hasOfficialUrl) {
    missing.push('Official URL');
  }

  if (!hasCheckedDate) {
    missing.push('Last checked date');
  }

  if (!hasActionableWindow && !hasDeadline) {
    missing.push('Current cycle timing');
  }

  if (verificationState !== 'verified') {
    missing.push('Official verification');
  }

  const alertable =
    hasOfficialUrl &&
    hasCheckedDate &&
    verificationState === 'verified' &&
    hasCurrentCycleTiming &&
    sendsUsefulAlerts &&
    ['openNow', 'opensSoon', 'deadlineSoon', 'watching'].includes(monitorSignal.alertReadiness);

  return {
    alertable,
    status: alertable ? 'Monitoring Ready' : missing.length <= 2 ? 'Needs Setup' : 'Needs Confirmation',
    missing,
  };
}

export function getVerificationPriority(opportunity) {
  const monitorSignal = getMonitorSignal(opportunity);
  const readiness = getMonitoringReadiness(opportunity);
  const tracks = getOpportunityTracks(opportunity);
  const underclassmenFit =
    opportunity.classYears.includes('Freshman') || opportunity.classYears.includes('Sophomore');
  const hasCurrentTiming =
    opportunity.openDate &&
    !opportunity.openDate.toLowerCase().includes('watch') &&
    !opportunity.openDate.toLowerCase().includes('verify');
  const sourceSignal = getSourceSignal(opportunity);
  let score = 0;

  if (monitorSignal.priority === 'high') {
    score += 40;
  }

  if (underclassmenFit) {
    score += 24;
  }

  if (tracks.includes('Software Engineering')) {
    score += 10;
  }

  if (tracks.includes('Product Management') || tracks.includes('Quant / Finance')) {
    score += 8;
  }

  if (sourceSignal.count > 1) {
    score += 8;
  }

  if (!hasCurrentTiming) {
    score += 6;
  }

  if (readiness.status === 'Needs Confirmation') {
    score += 12;
  }

  if (opportunity.status === 'verifyManually') {
    score += 10;
  }

  return {
    score,
    label: score >= 78 ? 'Verify First' : score >= 54 ? 'Verify Next' : 'Backlog',
    reason: underclassmenFit
      ? 'Underclassmen-facing record with alert value once official timing is confirmed.'
      : monitorSignal.priority === 'foundation'
      ? 'Prep resource; verify after higher-leverage application programs.'
        : 'Useful record, but lower urgency than underclassmen-first programs.',
  };
}

export function getSourceUpdatePlan(opportunity) {
  const readiness = getMonitoringReadiness(opportunity);
  const monitorSignal = getMonitorSignal(opportunity);
  const hasSpecificTiming =
    opportunity.openDate &&
    !opportunity.openDate.toLowerCase().includes('watch') &&
    !opportunity.openDate.toLowerCase().includes('verify') &&
    !opportunity.openDate.toLowerCase().includes('varies');
  const needsOfficialCycleCheck = readiness.missing.includes('Official verification');
  const needsTimingCheck = readiness.missing.includes('Current cycle timing');
  const checkCadence =
    monitorSignal.alertReadiness === 'openNow' || monitorSignal.alertReadiness === 'deadlineSoon'
      ? 'Daily until deadline is confirmed'
      : monitorSignal.alertReadiness === 'opensSoon'
        ? 'Twice weekly during the expected opening window'
        : needsOfficialCycleCheck || needsTimingCheck
          ? 'Weekly until the official cycle page is clear'
          : 'Monthly until the next expected season';
  const watchedPage = opportunity.url;
  const changeSignals = [
    'Application, apply, deadline, eligibility, or program-year language changes',
    hasSpecificTiming ? 'Opening or deadline date changes from the current record' : 'A new current-cycle date appears',
    needsOfficialCycleCheck ? 'Official page confirms the program still exists this cycle' : 'Official source confirms no material change',
  ];

  return {
    watchedPage,
    checkCadence,
    changeSignals,
    nextCheck: needsOfficialCycleCheck
      ? 'Verify official cycle before treating this as alert-ready'
      : needsTimingCheck
        ? 'Confirm current opening window or deadline'
        : monitorSignal.alertReadiness === 'openNow'
          ? 'Confirm application is still open before alerting'
          : 'Refresh during the next scheduled source pass',
    alertTrigger:
      monitorSignal.alertReadiness === 'openNow'
        ? 'Send only after official page confirms applications are open'
        : monitorSignal.alertReadiness === 'deadlineSoon'
          ? 'Send only after official deadline is confirmed'
          : 'Send only when a verified open date, deadline, or application page changes',
  };
}

export function getMonitorSignal(opportunity) {
  const tracks = getOpportunityTracks(opportunity);
  const highLeverageCategory = [
    'Internship',
    'Externship / insight series',
    'Winternship',
    'Fellowship',
    'Internship-matching fellowship',
    'Training program',
  ].includes(opportunity.category);
  const underclassmenFit =
    opportunity.classYears.includes('Freshman') || opportunity.classYears.includes('Sophomore');
  const foundationOnly = ['Scholarship', 'Conference funding', 'Technical community', 'Special program / resource'].includes(
    opportunity.category,
  );

  let priority = 'watch';

  if (underclassmenFit && highLeverageCategory) {
    priority = 'high';
  }

  if (foundationOnly) {
    priority = 'foundation';
  }

  let alertReadiness = 'prepare';

  if (opportunity.status === 'open') {
    alertReadiness = opportunity.confidence === 'needsReview' ? 'verify' : 'openNow';
  } else if (opportunity.status === 'expectedSoon') {
    alertReadiness = opportunity.confidence === 'needsReview' ? 'verify' : 'opensSoon';
  } else if (opportunity.status === 'deadlineSoon') {
    alertReadiness = opportunity.confidence === 'needsReview' ? 'verify' : 'deadlineSoon';
  } else if (opportunity.status === 'verifyManually' || opportunity.confidence === 'needsReview') {
    alertReadiness = 'verify';
  } else if (opportunity.status === 'watching') {
    alertReadiness = 'watching';
  }

  return {
    priority,
    priorityLabel: priorityLabels[priority],
    alertReadiness,
    alertReadinessLabel: alertReadinessLabels[alertReadiness],
    actionLabel: alertReadinessLabels[alertReadiness],
    sourceSignal: getSourceSignal(opportunity),
    tracks,
    nextAction:
      alertReadiness === 'openNow'
        ? 'Check the official page and apply as soon as your materials are ready.'
        : alertReadiness === 'opensSoon'
          ? 'Get materials ready now and watch the official page for the opening window.'
          : alertReadiness === 'deadlineSoon'
            ? 'Prioritize this now: confirm the deadline and submit before the window closes.'
        : alertReadiness === 'verify'
          ? 'Verify the official page before sending public alerts or relying on the date.'
          : alertReadiness === 'watching'
          ? 'Keep this program on your radar and refresh the official source on the next verification pass.'
            : 'Prepare resume, portfolio, and short application stories before the opening window.',
  };
}

export const opportunities = [
  {
    id: 'microsoft-explore-watch',
    name: 'Microsoft Explore',
    organization: 'Microsoft',
    category: 'Internship',
    classYears: ['Freshman'],
    timing: 'Summer',
    status: 'verifyManually',
    confidence: 'medium',
    funding: 'Paid internship',
    location: 'Varies by posting',
    url: 'https://careers.microsoft.com/v2/global/en/exploremicrosoft',
    previousUrl: '',
    openDate: 'Watch late summer and early fall postings',
    deadline: 'Verify current application posting',
    tags: ['Software engineering', 'Big tech', 'Underclassmen'],
    why:
      'A classic freshman-targeted software engineering internship signal that helps students get industry experience before junior-year recruiting.',
    prep:
      'Track Microsoft careers for Explore-specific role titles, prepare a freshman-friendly project story, and verify eligibility before sharing.',
    sourceNote:
      'Official Microsoft page confirms Explore is for first- and second-year students; current application posting and deadline still need cycle verification.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'palantir-path-watch',
    name: 'Palantir Path',
    organization: 'Palantir',
    category: 'Internship',
    classYears: ['Sophomore'],
    timing: 'Summer',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Paid internship',
    location: 'Varies by posting',
    url: 'https://www.palantir.com/careers/',
    previousUrl: '',
    openDate: 'Watch official student and early-talent pages for Path or Launch-style programs',
    deadline: 'Verify whether Path has a current-cycle official posting',
    tags: ['Software engineering', 'Product engineering', 'Underclassmen'],
    why:
      'A focused underclassmen internship path for students interested in product-heavy engineering and complex customer-facing systems.',
    prep:
      'Prepare systems and project examples, then check whether the current cycle lists Path separately from standard internship roles.',
    sourceNote:
      'Current official Palantir student pages show standard internships, new grad roles, Launch, and Meritocracy Fellowship; Path was not confirmed as a current official program.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'nasa-internships',
    name: 'NASA Internships',
    organization: 'NASA',
    category: 'Internship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'deadlineSoon',
    confidence: 'high',
    funding: 'Paid internship',
    location: 'In person, hybrid, or remote by posting',
    url: 'https://www.nasa.gov/learning-resources/internship-programs/',
    previousUrl: '',
    openDate: 'Spring, Summer, and Fall 2027 sessions listed by NASA',
    deadline: 'Spring 2027: Sep 14, 2026; Summer 2027: Feb 26, 2027; Fall 2027: May 21, 2027',
    tags: ['Government', 'Research', 'Engineering'],
    why:
      'A broad source where eligibility is posting-specific, which can make it friendlier to earlier students than a single fixed internship program.',
    prep:
      'Search by major, location, and class year. Save postings that explicitly include freshman or sophomore eligibility.',
    sourceNote:
      'Official NASA internship page lists OSTEM and Pathways programs, paid internships, eligibility details, and 2027 session deadlines.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'jane-street-fttp-watch',
    name: 'Focus on Trading and Technology',
    organization: 'Jane Street',
    category: 'Externship / insight series',
    classYears: ['Freshman'],
    timing: 'Spring',
    status: 'verifyManually',
    confidence: 'medium',
    funding: 'Varies',
    location: 'Insight program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/fttp/',
    previousUrl: '',
    openDate: 'Watch fall and winter for current FTTP sessions',
    deadline: 'Sign up to be notified; exact current deadline varies by program location',
    tags: ['Trading', 'Finance', 'Insight program'],
    why:
      'Short early-exposure programs help freshmen decide whether trading, math, finance, and technology environments are worth pursuing.',
    prep:
      'Prepare a concise interest note and track insight-program pages, not only internship pages.',
    sourceNote:
      'Official Jane Street FTTP page confirms the first-year undergraduate program; exact current-cycle sessions should be checked before alerts.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'virtu-womens-winternship-watch',
    name: "Women's Winternship",
    organization: 'Virtu Financial',
    category: 'Winternship',
    classYears: ['Sophomore'],
    timing: 'Winter',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Winter program',
    url: 'https://job-boards.greenhouse.io/virtu',
    previousUrl: 'https://www.virtu.com/careers/',
    openDate: 'January 2027 winternship postings are open in New York, Dublin, and Singapore',
    deadline: 'Singapore deadline: Oct 30, 2026; New York and Dublin deadlines are not listed',
    tags: ['Trading', 'Finance', 'Women in tech'],
    why:
      'Winternships can create a real signal during school breaks without requiring a full summer internship.',
    prep:
      'Search company careers for winternship language and prepare finance-plus-technology interest notes before fall deadlines.',
    sourceNote:
      'Official Virtu Greenhouse board lists January 2027 Women\'s Winternship postings in New York, Dublin, and Singapore; Singapore lists an Oct 30, 2026 deadline.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'google-summer-of-code',
    name: 'Google Summer of Code',
    organization: 'Google',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://summerofcode.withgoogle.com/',
    previousUrl: '',
    openDate: 'Watch winter for the next timeline; 2026 contributor applications opened March 16',
    deadline: '2026 contributor application deadline was March 31; watch for the 2027 timeline',
    tags: ['Open source', 'Mentorship', 'Remote'],
    why:
      'A strong nontraditional path for students who need credible technical experience without waiting for a company internship.',
    prep:
      'Review past organizations early, make small open-source contributions before applying, and choose projects where current skills can compound.',
    sourceNote:
      'Official GSoC site confirms the open-source contributor program and 2026 application timeline.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'outreachy',
    name: 'Outreachy',
    organization: 'Outreachy',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'expectedSoon',
    confidence: 'medium',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://www.outreachy.org/',
    previousUrl: '',
    openDate: 'Watch late August or early September for the next initial application window',
    deadline: 'Verify exact December 2026 initial application deadline',
    tags: ['Open source', 'Diversity in tech', 'Remote'],
    why:
      'A practical route into open-source contribution, mentorship, and paid technical experience for students who may not yet have internship access.',
    prep:
      'Read eligibility carefully, complete initial applications early, and budget time for contribution periods before final project selection.',
    sourceNote:
      'Official Outreachy pages confirm May and December internship cycles; the homepage lists December 2026 applications as early-to-mid August but does not give a specific deadline.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'mlh-fellowship',
    name: 'MLH Fellowship',
    organization: 'Major League Hacking',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://fellowship.mlh.com/programs/open-source',
    previousUrl: 'https://fellowship.mlh.io/',
    openDate: 'Rolling applications by cohort',
    deadline: 'Applications close a few weeks before each batch',
    tags: ['Open source', 'Software engineering', 'Production engineering'],
    why:
      'Internship-alternative experience with real open-source or partner-backed projects, mentors, peers, and a concrete portfolio signal.',
    prep:
      'Prepare a technical project story, GitHub links, and collaboration examples. Track cohort start dates because timing changes by track.',
    sourceNote:
      'Official MLH Fellowship site describes a fully remote 12-week internship alternative with stipend and open-source project work.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'coding-it-forward-fellowship',
    name: 'Coding it Forward Fellowship',
    organization: 'Coding it Forward',
    category: 'Internship-matching fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'medium',
    funding: 'Paid fellowship',
    location: 'United States',
    url: 'https://codingitforward.com/fellowship',
    previousUrl: '',
    openDate: 'Watch winter for the next fellowship application cycle',
    deadline: 'Verify next-cycle deadline on the official site',
    tags: ['Civic tech', 'Public interest tech', 'Software engineering'],
    why:
      'Distinctive path for students who want mission-driven technical work, government context, and public-service impact.',
    prep:
      'Prepare examples of technical ownership, communication with non-technical stakeholders, and interest in public interest technology.',
    sourceNote:
      'Official Coding it Forward page confirms a paid 10-week fellowship across software, product, data, design, and cybersecurity; current-cycle dates need application-page verification.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'codepath-career-ready-courses',
    name: 'Career-Ready Courses',
    organization: 'CodePath',
    category: 'Training program',
    classYears: ['All class years'],
    timing: 'Fall',
    status: 'deadlineSoon',
    confidence: 'high',
    funding: 'Free',
    location: 'Virtual',
    url: 'https://www.codepath.org/courses',
    previousUrl: '',
    openDate: 'Fall 2026 applications are open by pathway',
    deadline: 'Fall 2026 course page lists closing dates such as August 23 by pathway',
    tags: ['Technical interview prep', 'Applied AI', 'Cybersecurity', 'Web development'],
    why:
      'Structured technical practice, portfolio projects, and recruiting preparation outside standard coursework.',
    prep:
      'Match the pathway to the next bottleneck: interview prep, AI projects, cybersecurity, or web development.',
    sourceNote:
      'Official CodePath courses page lists no-cost virtual courses, current application links, and visible pathway close dates.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'forage-virtual-experience',
    name: 'Virtual Work Experience Programs',
    organization: 'Forage',
    category: 'Special program / resource',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Free',
    location: 'Virtual',
    url: 'https://www.theforage.com/',
    previousUrl: '',
    openDate: 'Open year-round',
    deadline: 'Program-specific',
    tags: ['Virtual experience', 'Career exploration', 'Beginner-friendly'],
    why:
      'Helpful for freshmen and sophomores who need low-friction exposure to industry workflows before applying to selective internships.',
    prep:
      'Use this as exploration and language-building, then convert completed programs into stronger project and interview stories.',
    sourceNote: 'Inspired by the repo special programs and resources section.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'new-technologists-academy',
    name: 'The New Technologists Academy',
    organization: 'The New Technologists',
    category: 'Fellowship',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'medium',
    funding: 'Stipend',
    location: 'In person',
    url: 'https://newtechnologists.com/',
    previousUrl: '',
    openDate: 'Watch winter and spring for the next Academy cycle; official site still lists Summer 2026',
    deadline: 'Verify exact next-cycle application deadline on official site',
    tags: ['Underclassmen', 'AI projects', 'Mentorship', 'Nontraditional backgrounds'],
    why:
      'A paid 7-week academy explicitly aimed at college freshmen and sophomores who want hands-on tech exposure, mentorship, and real-world project experience.',
    prep:
      'Prepare a clear story around curiosity, project-building, and why hands-on exposure would help you convert potential into a stronger technical path.',
    sourceNote:
      'Official site describes TNT Academy as a 7-week in-person program for college freshmen and sophomores.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'new-technologists-fellowship',
    name: 'The New Technologists Fellowship',
    organization: 'The New Technologists',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'medium',
    funding: 'Varies',
    location: 'Virtual',
    url: 'https://newtechnologists.com/',
    previousUrl: '',
    openDate: 'Watch fall and winter for the next fellowship cycle; official site says the program runs January through September',
    deadline: 'Verify exact next-cycle application deadline on official site',
    tags: ['Early-career', 'Project building', 'Mentorship', 'Professional development'],
    why:
      'A longer part-time technical and professional development track that can help emerging technologists build portfolio-worthy work over time.',
    prep:
      'Gather project examples and be ready to explain where you want deeper technical confidence, collaboration practice, and mentorship.',
    sourceNote:
      'Official site describes the fellowship as a nine-month virtual experience with project building, coding challenges, and professional development.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'seo-tech-developer-core',
    name: 'SEO Tech Developer',
    organization: 'SEO',
    category: 'Training program',
    classYears: ['Sophomore'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Virtual',
    url: 'https://tech.seo-usa.org/',
    previousUrl: '',
    openDate: 'Watch January for the next core program cycle; 2026 applications ran January through March',
    deadline: '2026 application window ended in March; verify next-cycle deadline',
    tags: ['Sophomore', 'Interview prep', 'Technical training', 'Stipend'],
    why:
      'A free intensive program for sophomore CS and software engineering students, with technical training, mentoring, interview prep, and a listed stipend.',
    prep:
      'Prepare resume, programming-language examples, and a story about why structured technical coaching will help you compete for stronger internships.',
    sourceNote:
      'Official site lists a January-March 2026 application timeline and sophomore eligibility criteria.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'seo-tech-developer-first-year-academy',
    name: 'SEO Tech Developer First-Year Academy',
    organization: 'SEO',
    category: 'Training program',
    classYears: ['Freshman'],
    timing: 'Spring',
    status: 'expectedSoon',
    confidence: 'high',
    funding: 'Free',
    location: 'Virtual',
    url: 'https://tech.seo-usa.org/',
    previousUrl: '',
    openDate: 'Watch November for the next first-year cycle; prior cycle opened November 12, 2025',
    deadline: 'Verify current application close date',
    tags: ['Freshman', 'Python basics', 'Portfolio project', 'Training'],
    why:
      'A first-year pathway that helps students build foundational coding confidence and prepare for later technical programs before sophomore recruiting pressure arrives.',
    prep:
      'Use the fall to prepare a basic resume, list coursework or self-study, and get ready to explain your interest in computer science fundamentals.',
    sourceNote:
      'Official site describes a two-part first-year training program with spring and summer phases.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'headstart-fellowship-watch',
    name: 'HeadStart Fellowship',
    organization: 'HeadStart Fellowship',
    category: 'Fellowship',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Fall',
    status: 'deadlineSoon',
    confidence: 'high',
    funding: 'Free',
    location: 'Virtual',
    url: 'https://www.headstartfellowship.com/fellowship',
    previousUrl: '',
    openDate: 'Fall 2026 applications are open',
    deadline: 'Fall 2026 applications close Aug 28, 2026 at 11:59 p.m. ET',
    tags: ['Mentorship', 'Career prep', 'Underclassmen', 'Virtual'],
    why:
      'A mentorship and education-style fellowship that appears frequently in underclassmen opportunity lists as an early career preparation path.',
    prep:
      'Confirm the current cycle, then prepare a short interest statement and a resume that shows technical curiosity even if your experience is early.',
    sourceNote:
      'Official HeadStart Fellowship pages confirm Fall 2026 applications, freshman/sophomore eligibility, a virtual format, and the Aug 28, 2026 close date.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'hack-diversity-fellowship-watch',
    name: 'Hack.Diversity Fellowship',
    organization: 'Hack.Diversity',
    category: 'Internship-matching fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'verifyManually',
    confidence: 'medium',
    funding: 'Paid internship',
    location: 'Boston or NYC region',
    url: 'https://www.hackdiversity.com/',
    previousUrl: '',
    openDate: 'Watch fall and winter for the next fellowship application page',
    deadline: 'Verify the current application deadline on the official application page',
    tags: ['Internship matching', 'Technical training', 'Underrepresented students'],
    why:
      'A strong internship-matching model for students who would benefit from structured technical training, partner access, and support through placement.',
    prep:
      'Verify city eligibility, polish resume, and prepare examples of persistence, collaboration, and technical learning.',
    sourceNote:
      'Official site confirms the fellowship model and regional focus, but a current-cycle application page was not found during this audit.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'jane-street-see-watch',
    name: 'SEE Program',
    organization: 'Jane Street',
    category: 'Externship / insight series',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Spring',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Varies',
    location: 'Insight program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/see/',
    previousUrl: '',
    openDate: 'Watch fall and winter for current SEE sessions',
    deadline: 'Sign up to be notified; exact current deadline varies by program location',
    tags: ['Computer science', 'Math', 'Finance', 'Insight program'],
    why:
      'A focused early-exposure program for students curious about the intersection of computer science, math, and finance.',
    prep:
      'Prepare to explain interest in technical problem solving, probability/math, and why a trading-technology environment is worth exploring.',
    sourceNote:
      'Official Jane Street SEE page confirms the early-exposure program; exact current-cycle sessions should be checked before alerts.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'jpmorgan-career-ed-you-watch',
    name: 'Career.edYOU Academy',
    organization: 'JPMorgan Chase',
    category: 'Externship / insight series',
    classYears: ['Sophomore'],
    timing: 'Spring',
    status: 'watching',
    confidence: 'medium',
    funding: 'Varies',
    location: 'Varies by program',
    url: 'https://www.jpmorganchase.com/careers/explore-opportunities/programs/career-edyou',
    previousUrl: '',
    openDate: 'Registration is currently closed; watch fall and winter for the next sophomore cohort',
    deadline: 'Verify the next registration deadline when JPMorganChase reopens locations',
    tags: ['Finance', 'Technology', 'Career exposure', 'Sophomore'],
    why:
      'Bank early-insight programs can help sophomores understand financial technology roles before applying for larger internship pipelines.',
    prep:
      'Search JPMorgan Chase careers directly, confirm the program name and location, and prepare a finance-plus-technology interest story.',
    sourceNote:
      'Official JPMorganChase page confirms Career.edYOU for U.S. college sophomores and says registration is currently closed.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'acm-w-research-conference-scholarships',
    name: 'ACM-W Research Conference Scholarships',
    organization: 'ACM-W',
    category: 'Conference funding',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'deadlineSoon',
    confidence: 'high',
    funding: 'Travel support',
    location: 'Conference travel',
    url: 'https://women.acm.org/scholarships/',
    previousUrl: '',
    openDate: 'Six conference-date deadline groups run throughout the year',
    deadline: 'Next listed deadline: Oct 15, 2026 for Dec 1, 2026-Jan 30, 2027 conferences',
    tags: ['Research conference', 'CS research', 'Women in computing'],
    why:
      'Useful for students who want to attend research conferences before they have a large travel budget or strong academic network.',
    prep:
      'Pick the conference first, draft why attendance supports your path, and ask an advisor early for the support letter.',
    sourceNote:
      'Official ACM-W scholarship page lists recurring conference-date groups and the next Oct 15, 2026 deadline.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'rewriting-the-code-community',
    name: 'Student Community',
    organization: 'Rewriting the Code',
    category: 'Technical community',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Free',
    location: 'Virtual and in-person events',
    url: 'https://rewritingthecode.org/',
    previousUrl: '',
    openDate: 'Rolling',
    deadline: 'Program-specific events vary',
    tags: ['Women in tech', 'Mentorship', 'Career events'],
    why:
      'High-signal community layer for women in tech that combines peer support, career programming, company access, and practical resources.',
    prep:
      'Join the community first, then watch the member portal, events calendar, and company programs for higher-leverage opportunities.',
    sourceNote:
      'Official Rewriting the Code site confirms free community access, student and early-career programming, and year-round member support.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'colorstack-membership',
    name: 'ColorStack Membership',
    organization: 'ColorStack',
    category: 'Technical community',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Free',
    location: 'Virtual community and events',
    url: 'https://www.colorstack.org/students',
    previousUrl: '',
    openDate: 'Rolling membership application',
    deadline: 'Membership is open; events and partner programs vary',
    tags: ['Black CS students', 'Latinx CS students', 'Career fairs'],
    why:
      'A strong example of community as opportunity infrastructure: Slack support, workshops, resume visibility, and partner events.',
    prep: 'Join early, keep resume materials updated, and watch monthly opportunities and career fair announcements.',
    sourceNote:
      'Official ColorStack student page confirms the member application for Black and Latinx undergraduate CS students in the US.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'nsf-reu-computer-science',
    name: 'Research Experiences for Undergraduates',
    organization: 'U.S. National Science Foundation',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'medium',
    funding: 'Stipend',
    location: 'Host-site dependent',
    url: 'https://www.nsf.gov/funding/initiatives/reu',
    previousUrl: '',
    openDate: 'Watch individual REU sites and NSF ETAP for winter application openings',
    deadline: 'Site-specific student deadlines vary by host site',
    tags: ['Research', 'Graduate school prep', 'Summer'],
    why:
      'High-value research pathway for undergraduates considering graduate school, research careers, or deeper technical specialization.',
    prep:
      'Search for CS-adjacent REU sites, request references early, and tailor statements to each lab or research theme.',
    sourceNote:
      'Official NSF REU page confirms undergraduate research sites, stipends, and the student application path through host sites or NSF ETAP.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'swe-scholarships',
    name: 'SWE Scholarships',
    organization: 'Society of Women Engineers',
    category: 'Scholarship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Scholarship',
    location: 'Scholarship',
    url: 'https://swe.org/scholarships-overview/',
    previousUrl: 'https://swe.org/apply-for-a-swe-scholarship/',
    openDate: 'Watch December for Collegiate/Graduate and February for Emerging First Year; the 2026-27 cycle is closed',
    deadline: 'Watch January and March scholarship deadlines by application type',
    tags: ['Engineering', 'Women in STEM', 'Scholarship'],
    why:
      'Broad scholarship pool for women in engineering and related technical disciplines, often worth watching early in the year.',
    prep:
      'Check membership requirements, gather academic details, and save scholarships that match year, major, and identity criteria.',
    sourceNote:
      'Official SWE scholarship overview confirms the 2026-27 cycle is closed and links to the 2027-2028 interest form; the apply page keeps the detailed application timeline.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'ghc-scholarship-watch',
    name: 'Grace Hopper Celebration Scholarship Watch',
    organization: 'AnitaB.org',
    category: 'Conference funding',
    classYears: ['All class years'],
    timing: 'Spring',
    status: 'expectedSoon',
    confidence: 'medium',
    funding: 'Travel support',
    location: 'Conference',
    url: 'https://ghc.anitab.org/awards-programs/scholarships',
    previousUrl: '',
    openDate: 'Scholarship pages are closed or interest-list only; Kamala Scholars says 2026 applications are coming soon',
    deadline: 'Verify the current scholarship application window when GHC or AnitaB posts it',
    tags: ['GHC', 'Women in computing', 'Conference funding'],
    why:
      'Major women-in-computing conference pathway with recruiting, community, technical sessions, and visibility for students.',
    prep:
      'Track the official GHC site, school sponsorship paths, employer sponsorships, and local women-in-tech group funding options.',
    sourceNote:
      'Official AnitaB pages confirm GHC scholarship interest-list status and the Kamala Scholars program, but exact current scholarship dates are not posted.',
    lastChecked: '2026-08-18',
  },
];

export const stats = [
  { label: 'Programs', value: String(opportunities.length) },
  { label: 'Recommended', value: String(opportunities.filter((item) => getMonitorSignal(item).priority === 'high').length) },
  { label: 'Confirmed', value: String(opportunities.filter((item) => getVerificationState(item) === 'verified').length) },
  { label: 'Needs review', value: String(opportunities.filter((item) => getMonitorSignal(item).alertReadiness === 'verify').length) },
];

export const monitoringStats = [
  {
    label: 'Monitoring ready',
    value: String(opportunities.filter((item) => getMonitoringReadiness(item).alertable).length),
  },
  {
    label: 'Needs setup',
    value: String(opportunities.filter((item) => getMonitoringReadiness(item).status === 'Needs Setup').length),
  },
  {
    label: 'Needs verification',
    value: String(opportunities.filter((item) => getMonitoringReadiness(item).status === 'Needs Confirmation').length),
  },
];

export const verificationQueue = opportunities
  .filter((item) => !getMonitoringReadiness(item).alertable)
  .map((item) => ({
    opportunity: item,
    priority: getVerificationPriority(item),
    readiness: getMonitoringReadiness(item),
  }))
  .sort((a, b) => b.priority.score - a.priority.score || a.opportunity.name.localeCompare(b.opportunity.name));
