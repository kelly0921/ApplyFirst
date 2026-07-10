export const statusLabels = {
  open: 'Open Now',
  watching: 'Watching',
  expectedSoon: 'Opening Soon',
  deadlineSoon: 'Deadline Soon',
  verifyManually: 'Needs Review',
};

export const confidenceLabels = {
  high: 'High Confidence',
  medium: 'Medium Confidence',
  needsReview: 'Needs Review',
};

export const verificationLabels = {
  verified: 'Verified',
  watchOnly: 'Watch Only',
  needsReview: 'Needs Review',
};

export const priorityLabels = {
  high: 'Recommended',
  watch: 'Watch List',
  foundation: 'Foundation',
};

export const alertReadinessLabels = {
  openNow: 'Apply Now',
  opensSoon: 'Prepare Now',
  watching: 'Watch for Opening',
  deadlineSoon: 'Deadline Soon',
  verify: 'Needs Verification',
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
  'coding-it-forward',
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
    !opportunity.deadline.toLowerCase().includes('verify') &&
    !opportunity.deadline.toLowerCase().includes('varies');
  const verificationState = getVerificationState(opportunity);
  const monitorSignal = getMonitorSignal(opportunity);

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
    ['openNow', 'opensSoon', 'deadlineSoon', 'watching'].includes(monitorSignal.alertReadiness);

  return {
    alertable,
    status: alertable ? 'Monitoring Ready' : missing.length <= 2 ? 'Needs Setup' : 'Needs Verification',
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

  if (readiness.status === 'Needs Verification') {
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
        ? 'Foundation resource; verify after higher-leverage application programs.'
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
  const watchedPage = opportunity.previousUrl || opportunity.url;
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
            ? 'Keep this on the watchlist and refresh the official source on the next verification pass.'
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
    confidence: 'needsReview',
    funding: 'Paid internship',
    location: 'Varies by posting',
    url: 'https://careers.microsoft.com/',
    previousUrl: '',
    openDate: 'Watch summer and early fall postings',
    deadline: 'Verify current posting',
    tags: ['Software engineering', 'Big tech', 'Underclassmen'],
    why:
      'A classic freshman-targeted software engineering internship signal that helps students get industry experience before junior-year recruiting.',
    prep:
      'Track Microsoft careers for Explore-specific role titles, prepare a freshman-friendly project story, and verify eligibility before sharing.',
    sourceNote:
      'Inspired by the underclassmen-internships repo taxonomy; official posting must be verified before public alerts.',
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
    openDate: 'Watch summer and early fall postings',
    deadline: 'Verify current posting',
    tags: ['Software engineering', 'Product engineering', 'Underclassmen'],
    why:
      'A focused underclassmen internship path for students interested in product-heavy engineering and complex customer-facing systems.',
    prep:
      'Prepare systems and project examples, then check whether the current cycle lists Path separately from standard internship roles.',
    sourceNote:
      'Inspired by the underclassmen-internships repo taxonomy; official posting must be verified before public alerts.',
  },
  {
    id: 'nasa-internships',
    name: 'NASA Internships',
    organization: 'NASA',
    category: 'Internship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid internship',
    location: 'In person, hybrid, or remote by posting',
    url: 'https://intern.nasa.gov/',
    previousUrl: '',
    openDate: 'Three annual sessions listed by NASA',
    deadline: 'Spring 2027: Sep 14, 2026; Summer 2027: Feb 26, 2027; Fall 2027: May 21, 2027',
    tags: ['Government', 'Research', 'Engineering'],
    why:
      'A broad source where eligibility is posting-specific, which can make it friendlier to earlier students than a single fixed internship program.',
    prep:
      'Search by major, location, and class year. Save postings that explicitly include freshman or sophomore eligibility.',
    sourceNote:
      'Official NASA internship page lists OSTEM and Pathways programs, paid internships, eligibility details, and 2027 session deadlines.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'jane-street-fttp-watch',
    name: 'Focus on Trading and Technology',
    organization: 'Jane Street',
    category: 'Externship / insight series',
    classYears: ['Freshman'],
    timing: 'Spring',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Varies',
    location: 'Insight program',
    url: 'https://www.janestreet.com/join-jane-street/',
    previousUrl: '',
    openDate: 'Watch fall and winter',
    deadline: 'Verify current program cycle',
    tags: ['Trading', 'Finance', 'Insight program'],
    why:
      'Short early-exposure programs help freshmen decide whether trading, math, finance, and technology environments are worth pursuing.',
    prep:
      'Prepare a concise interest note and track insight-program pages, not only internship pages.',
    sourceNote: 'Inspired by the repo section for externships and insight series.',
  },
  {
    id: 'virtu-womens-winternship-watch',
    name: "Women's Winternship",
    organization: 'Virtu Financial',
    category: 'Winternship',
    classYears: ['Sophomore'],
    timing: 'Winter',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Varies',
    location: 'Winter program',
    url: 'https://www.virtu.com/careers/',
    previousUrl: '',
    openDate: 'Watch fall postings',
    deadline: 'Verify current posting',
    tags: ['Trading', 'Finance', 'Women in tech'],
    why:
      'Winternships can create a real signal during school breaks without requiring a full summer internship.',
    prep:
      'Search company careers for winternship language and prepare finance-plus-technology interest notes before fall deadlines.',
    sourceNote: 'Inspired by the repo winternship section.',
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
    openDate: 'Contributor applications open March 16, 2026',
    deadline: 'Contributor application deadline: March 31, 2026',
    tags: ['Open source', 'Mentorship', 'Remote'],
    why:
      'A strong nontraditional path for students who need credible technical experience without waiting for a company internship.',
    prep:
      'Review past organizations early, make small open-source contributions before applying, and choose projects where current skills can compound.',
    sourceNote:
      'Official GSoC site confirms the open-source contributor program and 2026 application timeline.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'outreachy',
    name: 'Outreachy',
    organization: 'Outreachy',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'expectedSoon',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://www.outreachy.org/',
    previousUrl: '',
    openDate: 'December 2026 applications expected early to mid August',
    deadline: 'May 2026 applications closed February 13, 2026; next cycle dates listed as August window',
    tags: ['Open source', 'Diversity in tech', 'Remote'],
    why:
      'A practical route into open-source contribution, mentorship, and paid technical experience for students who may not yet have internship access.',
    prep:
      'Read eligibility carefully, complete initial applications early, and budget time for contribution periods before final project selection.',
    sourceNote: 'Official Outreachy site lists paid remote 3-month internships, May and December cycles, and current 2026 dates.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'mlh-fellowship',
    name: 'MLH Fellowship',
    organization: 'Major League Hacking',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://fellowship.mlh.com/',
    previousUrl: 'https://fellowship.mlh.io/',
    openDate: 'Varies by cohort',
    deadline: 'Varies by start date',
    tags: ['Open source', 'Software engineering', 'Production engineering'],
    why:
      'Internship-alternative experience with real open-source or partner-backed projects, mentors, peers, and a concrete portfolio signal.',
    prep:
      'Prepare a technical project story, GitHub links, and collaboration examples. Track cohort start dates because timing changes by track.',
    sourceNote:
      'Official MLH Fellowship site describes a fully remote 12-week internship alternative with stipend and open-source project work.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'coding-it-forward-fellowship',
    name: 'Coding it Forward Fellowship',
    organization: 'Coding it Forward',
    category: 'Internship-matching fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid fellowship',
    location: 'United States',
    url: 'https://codingitforward.com/fellowship',
    previousUrl: '',
    openDate: 'Watch October through winter',
    deadline: 'Seasonal application cycle; confirm exact dates on official apply page',
    tags: ['Civic tech', 'Public interest tech', 'Software engineering'],
    why:
      'Distinctive path for students who want mission-driven technical work, government context, and public-service impact.',
    prep:
      'Prepare examples of technical ownership, communication with non-technical stakeholders, and interest in public interest technology.',
    sourceNote:
      'Official Coding it Forward page describes a paid 10-week fellowship for early-career technologists across software, product, data, design, and cybersecurity.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'codepath-career-ready-courses',
    name: 'Career-Ready Courses',
    organization: 'CodePath',
    category: 'Training program',
    classYears: ['All class years'],
    timing: 'Fall',
    status: 'open',
    confidence: 'high',
    funding: 'Free',
    location: 'Virtual',
    url: 'https://www.codepath.org/courses',
    previousUrl: '',
    openDate: 'Varies by term',
    deadline: 'Fall 2026 course page lists closing dates such as August 23 by pathway',
    tags: ['Technical interview prep', 'Applied AI', 'Cybersecurity', 'Web development'],
    why:
      'Structured technical practice, portfolio projects, and recruiting preparation outside standard coursework.',
    prep:
      'Match the pathway to the next bottleneck: interview prep, AI projects, cybersecurity, or web development.',
    sourceNote:
      'Official CodePath courses page lists no-cost virtual courses, current application links, and visible pathway close dates.',
    lastChecked: '2026-07-10',
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
    openDate: 'Summer 2026 listed on official site',
    deadline: 'Verify exact application deadline on official site',
    tags: ['Underclassmen', 'AI projects', 'Mentorship', 'Nontraditional backgrounds'],
    why:
      'A paid 7-week academy explicitly aimed at college freshmen and sophomores who want hands-on tech exposure, mentorship, and real-world project experience.',
    prep:
      'Prepare a clear story around curiosity, project-building, and why hands-on exposure would help you convert potential into a stronger technical path.',
    sourceNote:
      'Official site describes TNT Academy as a 7-week in-person program for college freshmen and sophomores.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'new-technologists-fellowship',
    name: 'The New Technologists Fellowship',
    organization: 'The New Technologists',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Varies',
    location: 'Virtual',
    url: 'https://newtechnologists.com/',
    previousUrl: '',
    openDate: 'Runs January through September',
    deadline: 'Verify exact application deadline on official site',
    tags: ['Early-career', 'Project building', 'Mentorship', 'Professional development'],
    why:
      'A longer part-time technical and professional development track that can help emerging technologists build portfolio-worthy work over time.',
    prep:
      'Gather project examples and be ready to explain where you want deeper technical confidence, collaboration practice, and mentorship.',
    sourceNote:
      'Official site describes the fellowship as a nine-month virtual experience with project building, coding challenges, and professional development.',
    lastChecked: '2026-07-10',
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
    openDate: 'January 2026 through March 2026',
    deadline: 'March 2026 application window listed',
    tags: ['Sophomore', 'Interview prep', 'Technical training', 'Stipend'],
    why:
      'A free intensive program for sophomore CS and software engineering students, with technical training, mentoring, interview prep, and a listed stipend.',
    prep:
      'Prepare resume, programming-language examples, and a story about why structured technical coaching will help you compete for stronger internships.',
    sourceNote:
      'Official site lists a January-March 2026 application timeline and sophomore eligibility criteria.',
    lastChecked: '2026-07-10',
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
    openDate: 'Applications open November 12, 2025',
    deadline: 'Verify current application close date',
    tags: ['Freshman', 'Python basics', 'Portfolio project', 'Training'],
    why:
      'A first-year pathway that helps students build foundational coding confidence and prepare for later technical programs before sophomore recruiting pressure arrives.',
    prep:
      'Use the fall to prepare a basic resume, list coursework or self-study, and get ready to explain your interest in computer science fundamentals.',
    sourceNote:
      'Official site describes a two-part first-year training program with spring and summer phases.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'headstart-fellowship-watch',
    name: 'HeadStart Fellowship',
    organization: 'HeadStart Fellowship',
    category: 'Fellowship',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Fall',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Free',
    location: 'Virtual',
    url: 'https://www.headstartfellowship.com/',
    previousUrl: '',
    openDate: 'Watch fall and spring cycles',
    deadline: 'Verify current application cycle',
    tags: ['Mentorship', 'Career prep', 'Underclassmen', 'Virtual'],
    why:
      'A mentorship and education-style fellowship that appears frequently in underclassmen opportunity lists as an early career preparation path.',
    prep:
      'Confirm the current cycle, then prepare a short interest statement and a resume that shows technical curiosity even if your experience is early.',
    sourceNote:
      'Included from underclassmen opportunity-list inspiration; needs current official-cycle verification before public alerts.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'hack-diversity-fellowship-watch',
    name: 'Hack.Diversity Fellowship',
    organization: 'Hack.Diversity',
    category: 'Internship-matching fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Paid internship',
    location: 'Boston or NYC region',
    url: 'https://www.hackdiversity.com/',
    previousUrl: '',
    openDate: 'Watch winter application cycle',
    deadline: 'Verify current application cycle',
    tags: ['Internship matching', 'Technical training', 'Underrepresented students'],
    why:
      'A strong internship-matching model for students who would benefit from structured technical training, partner access, and support through placement.',
    prep:
      'Verify city eligibility, polish resume, and prepare examples of persistence, collaboration, and technical learning.',
    sourceNote:
      'Needs current official fellowship page verification before public alerts.',
    lastChecked: '2026-07-10',
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
    url: 'https://www.janestreet.com/join-jane-street/',
    previousUrl: '',
    openDate: 'Watch fall and winter',
    deadline: 'Verify current program cycle',
    tags: ['Computer science', 'Math', 'Finance', 'Insight program'],
    why:
      'A focused early-exposure program for students curious about the intersection of computer science, math, and finance.',
    prep:
      'Prepare to explain interest in technical problem solving, probability/math, and why a trading-technology environment is worth exploring.',
    sourceNote:
      'Included from underclassmen opportunity-list inspiration; exact current cycle should be checked on Jane Street careers.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'jpmorgan-career-ed-you-watch',
    name: 'Career.edYOU Academy',
    organization: 'JPMorgan Chase',
    category: 'Externship / insight series',
    classYears: ['Sophomore'],
    timing: 'Spring',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Varies',
    location: 'Varies by program',
    url: 'https://careers.jpmorgan.com/',
    previousUrl: '',
    openDate: 'Watch fall and winter recruiting windows',
    deadline: 'Verify current posting',
    tags: ['Finance', 'Technology', 'Career exposure', 'Sophomore'],
    why:
      'Bank early-insight programs can help sophomores understand financial technology roles before applying for larger internship pipelines.',
    prep:
      'Search JPMorgan Chase careers directly, confirm the program name and location, and prepare a finance-plus-technology interest story.',
    sourceNote:
      'Included from underclassmen opportunity-list inspiration; needs official current posting verification.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'acm-w-research-conference-scholarships',
    name: 'ACM-W Research Conference Scholarships',
    organization: 'ACM-W',
    category: 'Conference funding',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Travel support',
    location: 'Conference travel',
    url: 'https://women.acm.org/scholarships/',
    previousUrl: '',
    openDate: 'Rolling deadline groups',
    deadline: 'Deadline groups vary by conference date',
    tags: ['Research conference', 'CS research', 'Women in computing'],
    why:
      'Useful for students who want to attend research conferences before they have a large travel budget or strong academic network.',
    prep:
      'Pick the conference first, draft why attendance supports your path, and ask an advisor early for the support letter.',
    sourceNote: 'Good candidate for the future conference funding layer.',
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
    sourceNote: 'Community as opportunity infrastructure, not just a social group.',
    lastChecked: '2026-07-10',
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
    url: 'https://www.colorstack.org/',
    previousUrl: '',
    openDate: 'Rolling',
    deadline: 'Membership and events vary',
    tags: ['Black CS students', 'Latinx CS students', 'Career fairs'],
    why:
      'A strong example of community as opportunity infrastructure: Slack support, workshops, resume visibility, and partner events.',
    prep: 'Join early, keep resume materials updated, and watch monthly opportunities and career fair announcements.',
    sourceNote: 'Strong community resource for students navigating tech without a dense network.',
    lastChecked: '2026-07-10',
  },
  {
    id: 'nsf-reu-computer-science',
    name: 'Research Experiences for Undergraduates',
    organization: 'U.S. National Science Foundation',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'expectedSoon',
    confidence: 'medium',
    funding: 'Stipend',
    location: 'Host-site dependent',
    url: 'https://www.nsf.gov/funding/initiatives/reu',
    previousUrl: '',
    openDate: 'Watch winter site deadlines',
    deadline: 'Site-specific deadlines often cluster in winter',
    tags: ['Research', 'Graduate school prep', 'Summer'],
    why:
      'High-value research pathway for undergraduates considering graduate school, research careers, or deeper technical specialization.',
    prep:
      'Search for CS-adjacent REU sites, request references early, and tailor statements to each lab or research theme.',
    sourceNote: 'A research-oriented path that complements internship lists.',
  },
  {
    id: 'swe-scholarships',
    name: 'SWE Scholarships',
    organization: 'Society of Women Engineers',
    category: 'Scholarship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'medium',
    funding: 'Scholarship',
    location: 'Scholarship',
    url: 'https://swe.org/scholarships-overview/',
    previousUrl: 'https://swe.org/scholarships/',
    openDate: 'Watch winter scholarship cycle',
    deadline: 'Annual cycle; verify current dates',
    tags: ['Engineering', 'Women in STEM', 'Scholarship'],
    why:
      'Broad scholarship pool for women in engineering and related technical disciplines, often worth watching early in the year.',
    prep:
      'Check membership requirements, gather academic details, and shortlist scholarships that match year, major, and identity criteria.',
    sourceNote: 'Useful for the funding side of the opportunity library.',
  },
  {
    id: 'ghc-scholarship-watch',
    name: 'Grace Hopper Celebration Scholarship Watch',
    organization: 'AnitaB.org',
    category: 'Conference funding',
    classYears: ['All class years'],
    timing: 'Spring',
    status: 'verifyManually',
    confidence: 'needsReview',
    funding: 'Travel support',
    location: 'Conference',
    url: 'https://ghc.anitab.org/',
    previousUrl: '',
    openDate: 'Watch spring conference cycle',
    deadline: 'Verify current GHC scholarship cycle',
    tags: ['GHC', 'Women in computing', 'Conference funding'],
    why:
      'Major women-in-computing conference pathway with recruiting, community, technical sessions, and visibility for students.',
    prep:
      'Track the official GHC site, school sponsorship paths, employer sponsorships, and local women-in-tech group funding options.',
    sourceNote: 'Needs official annual verification before public alerts.',
  },
];

export const stats = [
  { label: 'Programs', value: String(opportunities.length) },
  { label: 'Recommended', value: String(opportunities.filter((item) => getMonitorSignal(item).priority === 'high').length) },
  { label: 'Verified', value: String(opportunities.filter((item) => getVerificationState(item) === 'verified').length) },
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
    value: String(opportunities.filter((item) => getMonitoringReadiness(item).status === 'Needs Verification').length),
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
