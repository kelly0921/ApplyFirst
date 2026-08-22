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
  roleTracks: ['Software Engineering', 'Product Management', 'Design', 'Quant / Finance', 'Access & Prep'],
  priorities: Object.keys(priorityLabels),
  verification: Object.keys(verificationLabels),
  categories: [
    'Discovery Program',
    'Winternship',
    'Fellowship',
    'Startup / VC Fellowship',
    'Full-Time Alternative',
    'Scholarship / Funding',
    'Conference / Travel Funding',
    'Community / Prep Program',
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

  if (signal.match(/\bdesign\b|\bdesigner\b|\bdesigners\b|\bux\b|\bui\b|\bwireframe\b|\bwireframes\b|user research|product validation/)) {
    tracks.add('Design');
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
  'palantir-launch-spring-program',
  'palantir-american-tech-fellowship',
  'jane-street-fttp-watch',
  'virtu-womens-winternship-watch',
  'google-summer-of-code',
  'outreachy',
  'mlh-open-source-fellowship',
  'mlh-software-engineering-fellowship',
  'mlh-web3-engineering-fellowship',
  'mlh-production-engineering-fellowship',
  'coding-it-forward-fellowship',
  'new-technologists-academy',
  'seo-tech-developer-core',
  'headstart-fellowship-watch',
  'jane-street-see-watch',
  'jane-street-bridge-watch',
  'jane-street-focus-watch',
  'jane-street-in-focus-watch',
  'jane-street-insight-watch',
  'jane-street-jsip-watch',
  'jane-street-preview-watch',
  'jane-street-qtc-watch',
  'jane-street-wise-watch',
  'jane-street-amp-watch',
  'jpmorgan-career-ed-you-watch',
  'jpmorgan-code-for-good',
  'bloomberg-nextgen-leadership-summit',
  'capital-one-tech-summit',
  'capital-one-product-summit',
  'capital-one-analyst-early-internship',
  'citadel-discover-watch',
  'break-through-tech-ai-program',
  'break-through-tech-sprinternship',
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
  const sendsUsefulAlerts = !['Scholarship / Funding', 'Conference / Travel Funding', 'Community / Prep Program'].includes(
    opportunity.category,
  );

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
    'Discovery Program',
    'Winternship',
    'Fellowship',
    'Startup / VC Fellowship',
    'Full-Time Alternative',
  ].includes(opportunity.category);
  const underclassmenFit =
    opportunity.classYears.includes('Freshman') || opportunity.classYears.includes('Sophomore');
  const foundationOnly = ['Scholarship / Funding', 'Conference / Travel Funding', 'Community / Prep Program'].includes(
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
    category: 'Discovery Program',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'medium',
    funding: 'Paid program',
    location: 'Varies by posting',
    url: 'https://careers.microsoft.com/v2/global/en/exploremicrosoft',
    previousUrl: '',
    openDate: 'Watch late summer and early fall postings',
    deadline: 'Verify current application posting',
    tags: ['Software engineering', 'Big tech', 'Underclassmen'],
    description:
      'Explore Microsoft is a 12-week U.S. summer internship for first- and second-year students to experience software development, product thinking, and engineering teamwork before later-stage internship recruiting.',
    eligibilitySummary:
      'First- or second-year full-time bachelor student; technical-discipline interest and Microsoft internship eligibility rules apply.',
    experienceSummary:
      'Students work in pods with other Explore interns, move through product-development phases like design, build, and quality, and receive mentoring, community-building, and networking support.',
    detailBasis:
      'Current official Microsoft overview and eligibility pages; exact posting dates still need cycle confirmation.',
    why:
      'A classic freshman-targeted software engineering discovery signal that helps students get industry experience before junior-year recruiting.',
    prep:
      'Track Microsoft careers for Explore-specific role titles, prepare a freshman-friendly project story, and verify eligibility before sharing.',
    sourceNote:
      'Official Microsoft overview confirms Explore is for first- and second-year students and describes the U.S. program as a 12-week summer internship; current application posting and deadline still need cycle verification before alerts.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'palantir-launch-spring-program',
    name: 'Palantir Launch: Spring Program',
    organization: 'Palantir',
    category: 'Discovery Program',
    classYears: ['Sophomore'],
    timing: 'Spring',
    status: 'watching',
    confidence: 'medium',
    funding: 'Paid program',
    location: 'New York or Washington, DC',
    url: 'https://www.palantir.com/careers/students/launch/',
    previousUrl: '',
    openDate: 'Watch fall for the next Spring Launch application window',
    deadline: '2025 cycle closed; verify the next current-cycle application deadline',
    tags: ['Software engineering', 'Product engineering', 'Underclassmen', 'Insight program'],
    description:
      'Palantir Launch is a one-week spring insight program for students preparing for technical careers and future Palantir internship pathways.',
    eligibilitySummary:
      'Official 2025 U.S. program targeted bachelor students graduating in 2027 and studying CS, software engineering, or a related technical field.',
    experienceSummary:
      'Students work through interactive workshops, hands-on sessions, Palantir business exposure, and technical problem-solving with travel, lodging, and meals covered for selected participants.',
    detailBasis:
      'Official Palantir Launch page confirms the program model, but applications shown are for a closed 2025 cycle.',
    why:
      'A focused underclassmen discovery path for students interested in product-heavy engineering, data platforms, and complex customer-facing systems.',
    prep:
      'Prepare a technical resume, project examples, and a short story about why Palantir-style engineering problems are worth exploring; watch the fall application window.',
    sourceNote:
      'Official Palantir Launch page is the canonical place to watch for the next Spring Program cycle; next-cycle application dates need verification before alerts.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'palantir-american-tech-fellowship',
    name: 'American Tech Fellowship',
    organization: 'Palantir',
    category: 'Full-Time Alternative',
    classYears: ['All class years'],
    timing: 'Fall',
    status: 'open',
    confidence: 'high',
    funding: 'Free',
    location: 'Remote',
    url: 'https://jobs.lever.co/palantir/0ccbe620-a3ef-41d1-a5c4-68e56b3c91d0',
    previousUrl: '',
    openDate: 'Fall 2026 cohort applications are open',
    deadline: 'Apply while the Fall 2026 cohort remains open; exact close date is not listed',
    tags: ['AI', 'AIP', 'Foundry', 'No degree required', 'Full-Time Alternative'],
    description:
      'Palantir American Tech Fellowship is a 12-week remote training fellowship for builders learning to deploy Palantir Foundry and AIP in enterprise, industrial, and national-infrastructure settings.',
    eligibilitySummary:
      'Official posting requires at least 2 years of hands-on work experience, programming proficiency, and a technical background; no formal degree is required.',
    experienceSummary:
      'Fellows complete virtual training with Ontologize, attend live evening sessions, build AIP and Foundry deployment skills, and may interview for full-time roles at Palantir or partner companies.',
    detailBasis:
      'Official Palantir Lever posting lists the Fall 2026 open status, remote format, 12-week schedule, unpaid training model, and full-time interview path.',
    why:
      'A useful full-time alternative for builders who may not fit a traditional internship path but already have practical technical experience.',
    prep:
      'Prepare project evidence across software, data, hardware, automation, robotics, or industrial systems and be ready to show builder-style problem solving.',
    sourceNote:
      'Official Palantir Lever posting says Fall 2026 applications are open, the fellowship starts September 15, 2026, runs 12 weeks, is unpaid, and requires 2+ years of hands-on work experience.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-fttp-watch',
    name: 'Focus on Trading and Technology',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['Freshman'],
    timing: 'Spring',
    status: 'watching',
    confidence: 'medium',
    funding: 'Varies',
    location: 'Insight program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/fttp/',
    previousUrl: '',
    openDate: 'Watch fall and winter for current FTTP sessions',
    deadline: 'Sign up to be notified; exact current deadline varies by program location',
    tags: ['Trading', 'Finance', 'Insight program'],
    description:
      'Focus on Trading and Technology is Jane Street’s short first-year program for students curious about how math, technology, and trading models come together inside a quantitative trading firm.',
    eligibilitySummary:
      'First-year undergraduate audience; exact session eligibility can vary by location and cycle.',
    experienceSummary:
      'Students attend classes, learn trading and technology concepts, work through a team-based mock trading simulation, and get exposure to Jane Street’s problem-solving culture. Travel, accommodation, and a daily stipend are provided for the program.',
    detailBasis:
      'Current official Jane Street FTTP page confirms the program; session dates and deadlines vary.',
    why:
      'Short early-exposure programs help freshmen decide whether trading, math, finance, and technology environments are worth pursuing.',
    prep:
      'Prepare a concise interest note and track insight-program pages, not only internship pages.',
    sourceNote:
      'Official Jane Street FTTP page confirms the first-year undergraduate program, its trading-and-technology focus, and travel/accommodation/stipend support; exact current-cycle sessions should be checked before alerts.',
    lastChecked: '2026-08-22',
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
    location: 'New York, NY',
    url: 'https://job-boards.greenhouse.io/virtu/jobs/8445018002',
    previousUrl: 'https://www.virtu.com/careers/',
    openDate: 'January 11-15 New York winternship posting is live',
    deadline: 'Apply while the New York posting remains active; exact close date is not listed',
    tags: ['Trading', 'Finance', 'Women in tech'],
    description:
      'Virtu Women’s Winternship is a short winter program for students exploring trading, market structure, quantitative thinking, and financial technology.',
    eligibilitySummary:
      'Sophomore-leaning opportunity from the tracked source set; location-specific postings should be checked before applying.',
    experienceSummary:
      'Students get winter-break exposure to quantitative trading, engineering, market-making, and how technology supports electronic trading.',
    detailBasis:
      'Current official Virtu Greenhouse posting lists the New York Women’s Winternship.',
    why:
      'Winternships can create a real signal during school breaks without requiring a full summer internship.',
    prep:
      'Search company careers for winternship language and prepare finance-plus-technology interest notes before fall deadlines.',
    sourceNote:
      'Official Virtu Greenhouse posting lists the New York Women’s Winternship for second-year undergraduates graduating in 2029, with January 11-15 dates, provided meals, domestic transportation, and hotel.',
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
    description:
      'Google Summer of Code is a remote open-source contributor program where participants build real software with mentor organizations.',
    eligibilitySummary:
      'Open to eligible new and beginner open-source contributors; exact contributor rules follow the current GSoC guide.',
    experienceSummary:
      'Students learn open-source collaboration, code review, project scoping, maintainer communication, and how to turn contributions into public technical proof.',
    detailBasis:
      'Current official GSoC site confirms the program model; 2026 timeline is historical context until 2027 dates post.',
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
    description:
      'Outreachy is a paid remote internship program centered on open-source and open-science contribution.',
    eligibilitySummary:
      'Applicants must pass Outreachy eligibility rules; the program especially supports people affected by systemic bias in tech.',
    experienceSummary:
      'Remote mentored contribution period with open-source communities and project maintainers.',
    detailBasis:
      'Current official Outreachy pages confirm recurring May/December cycles; exact next deadline needs confirmation.',
    why:
      'A practical route into open-source contribution, mentorship, and paid technical experience for students who may not yet have internship access.',
    prep:
      'Read eligibility carefully, complete initial applications early, and budget time for contribution periods before final project selection.',
    sourceNote:
      'Official Outreachy pages confirm May and December internship cycles; the homepage lists December 2026 applications as early-to-mid August but does not give a specific deadline.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'mlh-open-source-fellowship',
    name: 'MLH Open Source Fellowship Track',
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
    tags: ['Open source', 'Software engineering', 'Remote'],
    description:
      'MLH Open Source Fellowship is a remote technical fellowship for students who want internship-alternative experience contributing to real open-source projects.',
    eligibilitySummary:
      'Student-friendly program with cohort-specific requirements; applicants should verify track and batch eligibility.',
    experienceSummary:
      'Students work with peers and mentors on open-source projects, build collaboration habits, and leave with stronger GitHub/project evidence.',
    detailBasis:
      'Current official MLH Open Source track page describes the 12-week remote fellowship and rolling cohort model.',
    why:
      'Internship-alternative experience with real open-source or partner-backed projects, mentors, peers, and a concrete portfolio signal.',
    prep:
      'Prepare a technical project story, GitHub links, and collaboration examples. Track cohort start dates because timing changes by batch.',
    sourceNote:
      'Official MLH Fellowship site describes a fully remote 12-week internship alternative with stipend and open-source project work.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'mlh-software-engineering-fellowship',
    name: 'MLH Software Engineering Fellowship Track',
    organization: 'Major League Hacking',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://fellowship.mlh.com/programs/software-engineering',
    previousUrl: 'https://fellowship.mlh.io/',
    openDate: 'Fall 2026 batch listed for Sep 14-Dec 4, 2026',
    deadline: 'Applications are rolling and close a few weeks before each batch',
    tags: ['Software engineering', 'Mentorship', 'Remote'],
    description:
      'MLH Software Engineering Fellowship is a 12-week remote internship alternative where fellows collaborate on real partner-backed software projects.',
    eligibilitySummary:
      'Open to applicants over 18 who can commit at least 20 hours per week, communicate in English, work in supported time zones, and code proficiently in at least one programming language.',
    experienceSummary:
      'Fellows join a small pod, receive technical mentorship, practice code review and pair programming, and contribute to open- or closed-source projects that partner teams depend on.',
    detailBasis:
      'Current official MLH Software Engineering track page lists Fall 2026 dates and the rolling-batch model.',
    why:
      'Strong internship-alternative signal for students who need real software-team experience before or alongside traditional recruiting.',
    prep:
      'Prepare GitHub/project examples, collaboration stories, and time availability for a 20-hour-per-week remote cohort.',
    sourceNote:
      'Official MLH Software Engineering track page lists Fall 2026 dates, 20 hours per week, and a 12-week remote fellowship model.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'mlh-web3-engineering-fellowship',
    name: 'MLH Web3 Engineering Fellowship Track',
    organization: 'Major League Hacking',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://fellowship.mlh.com/programs/web3-engineering',
    previousUrl: 'https://fellowship.mlh.io/',
    openDate: 'Fall 2026 batch listed for Sep 14-Dec 4, 2026',
    deadline: 'Applications are rolling and close a few weeks before each batch',
    tags: ['Web3', 'Blockchain', 'Software engineering', 'Remote'],
    description:
      'MLH Web3 Engineering Fellowship is a 12-week remote track for students who want to build with blockchain-backed technologies and emerging web platforms.',
    eligibilitySummary:
      'Open to applicants over 18 who can commit at least 20 hours per week, communicate in English, work in supported time zones, and code proficiently in at least one programming language.',
    experienceSummary:
      'Fellows learn blockchain development concepts, collaborate with a pod, receive engineering mentorship, and contribute to Web3 applications and technical projects.',
    detailBasis:
      'Current official MLH Web3 Engineering track page lists Fall 2026 dates and track-specific blockchain learning goals.',
    why:
      'Useful for students who want a structured way to test interest in blockchain engineering without relying on vague Web3 job postings.',
    prep:
      'Prepare core programming examples, learn basic blockchain vocabulary, and be ready to explain why decentralized systems interest you.',
    sourceNote:
      'Official MLH Web3 Engineering track page lists Fall 2026 dates, 20 hours per week, and blockchain-focused fellowship outcomes.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'mlh-production-engineering-fellowship',
    name: 'MLH Production Engineering Fellowship Track',
    organization: 'Major League Hacking',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Stipend',
    location: 'Remote',
    url: 'https://fellowship.mlh.com/',
    previousUrl: '',
    openDate: 'Fall 2026 batch listed for Sep 14-Dec 4, 2026',
    deadline: 'Applications are rolling and close a few weeks before each batch',
    tags: ['Production engineering', 'SRE', 'Infrastructure', 'Remote'],
    description:
      'MLH Production Engineering Fellowship is the infrastructure/SRE-oriented MLH track for students who want to learn how production systems stay reliable at scale.',
    eligibilitySummary:
      'Open to applicants over 18 who can commit at least 20 hours per week, communicate in English, work in supported time zones, and code proficiently in at least one programming language.',
    experienceSummary:
      'Fellows learn production engineering and site reliability concepts, collaborate with a pod, receive technical mentorship, and practice systems-oriented engineering through the MLH Fellowship model.',
    detailBasis:
      'Current official MLH Fellowship page and application flow list Production Engineering as a selectable fellowship track alongside the Fall 2026 batch.',
    why:
      'Production engineering is a distinct path from general SWE and helps students explore infrastructure, reliability, and systems work earlier.',
    prep:
      'Prepare systems, debugging, Linux, networking, or infrastructure examples and verify the track page before applying.',
    sourceNote:
      'Official MLH Fellowship page and application flow list Production Engineering as a fellowship track; the track uses the same rolling MLH Fellowship application model.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'coding-it-forward-fellowship',
    name: 'Coding it Forward Fellowship',
    organization: 'Coding it Forward',
    category: 'Fellowship',
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
    description:
      'Coding it Forward Fellowship places early-career technologists in civic and public-interest technology work.',
    eligibilitySummary:
      'Undergraduate, graduate, and early-career eligibility varies by fellowship cycle and placement requirements.',
    experienceSummary:
      'Paid 10-week fellowship across software, product, data, design, cybersecurity, and public-sector teams.',
    detailBasis:
      'Current official fellowship overview confirms the model; next-cycle application dates need confirmation.',
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
    category: 'Community / Prep Program',
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
    description:
      'CodePath Career-Ready Courses are free technical courses that help students build skills and recruiting readiness.',
    eligibilitySummary:
      'Student course eligibility varies by pathway; applicants should choose the course matching their skill stage.',
    experienceSummary:
      'Virtual coursework in areas like technical interview prep, applied AI, cybersecurity, and web development.',
    detailBasis:
      'Current official CodePath courses page lists active Fall 2026 pathways and closing dates by course.',
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
    category: 'Community / Prep Program',
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
    description:
      'Forage hosts free virtual job simulations that let students try realistic tasks from companies and career paths.',
    eligibilitySummary:
      'Generally open access; individual simulations may be better suited to specific roles or skill levels.',
    experienceSummary:
      'Self-paced virtual tasks that can help students learn role language, workflows, and portfolio talking points.',
    detailBasis:
      'Current public Forage platform model is rolling; ApplyFirst treats this as a prep resource, not an opening alert.',
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
    description:
      'The New Technologists Academy is a paid, hands-on program for freshmen and sophomores building technical confidence.',
    eligibilitySummary:
      'College freshmen and sophomores; exact next-cycle eligibility should be checked when applications reopen.',
    experienceSummary:
      'Seven-week in-person academy with project work, mentorship, and real-world technical exposure.',
    detailBasis:
      'Official site describes the Academy, but the visible cycle still references Summer 2026.',
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
    description:
      'The New Technologists Fellowship is a longer virtual experience for emerging technologists building projects and professional skills.',
    eligibilitySummary:
      'Early-career technologist audience; exact cohort eligibility should be confirmed when applications reopen.',
    experienceSummary:
      'Nine-month virtual experience with project building, coding challenges, and professional development.',
    detailBasis:
      'Official site describes the fellowship model; next-cycle dates need confirmation.',
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
    category: 'Community / Prep Program',
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
    description:
      'SEO Tech Developer is a technical training and career-prep program for sophomore CS and software engineering students.',
    eligibilitySummary:
      'Sophomore students in CS or software-engineering-related paths; next-cycle criteria should be confirmed.',
    experienceSummary:
      'Technical training, mentoring, interview preparation, and professional development with a listed stipend.',
    detailBasis:
      'Official SEO Tech Developer site lists 2026 timeline and eligibility; current text is previous-cycle context.',
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
    category: 'Community / Prep Program',
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
    description:
      'SEO Tech Developer First-Year Academy helps first-year students build foundational programming and career readiness.',
    eligibilitySummary:
      'First-year students; exact next-cycle eligibility and deadline should be confirmed when applications reopen.',
    experienceSummary:
      'Two-part training structure with spring foundations and summer project or technical development work.',
    detailBasis:
      'Official SEO site describes the Academy; opening date is based on prior-cycle context until current dates post.',
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
    description:
      'HeadStart Fellowship is a virtual underclassmen fellowship focused on mentorship, career preparation, and early recruiting confidence.',
    eligibilitySummary:
      'Freshman and sophomore students; current Fall 2026 application page should be checked before applying.',
    experienceSummary:
      'Virtual mentorship and education-style programming for students preparing for technical opportunities.',
    detailBasis:
      'Current official HeadStart pages list Fall 2026 applications and deadline.',
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
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'medium',
    funding: 'Paid program',
    location: 'Boston or NYC region',
    url: 'https://www.hackdiversity.com/',
    previousUrl: '',
    openDate: 'Watch fall and winter for the next fellowship application page',
    deadline: 'Verify the current application deadline on the official application page',
    tags: ['Internship matching', 'Technical training', 'Underrepresented students'],
    description:
      'Hack.Diversity Fellowship is a nine-month career-launch program that develops underrepresented technical talent and connects fellows with paid internships at partner companies.',
    eligibilitySummary:
      'Regional and cohort eligibility must be verified on the current application page; official public copy highlights Boston and New York City.',
    experienceSummary:
      'Fellows complete professional-skills development, technical team projects, industry exposure, and a 40-hour-per-week paid internship with a host company.',
    detailBasis:
      'Current official site confirms the model; current-cycle application page was not confirmed in the audit.',
    why:
      'A strong internship-matching model for students who would benefit from structured technical training, partner access, and support through placement.',
    prep:
      'Verify city eligibility, polish resume, and prepare examples of persistence, collaboration, and technical learning.',
    sourceNote:
      'Official Hack.Diversity site confirms the nine-month fellowship model, Boston/New York focus, and paid host-company internship outcome, but a current-cycle application page was not found during this audit.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-see-watch',
    name: 'SEE Program',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Spring',
    status: 'watching',
    confidence: 'medium',
    funding: 'Varies',
    location: 'Insight program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/see/',
    previousUrl: '',
    openDate: 'Watch fall and winter for current SEE sessions',
    deadline: 'Sign up to be notified; exact current deadline varies by program location',
    tags: ['Computer science', 'Math', 'Finance', 'Insight program'],
    description:
      'Jane Street SEE is a multi-day early-exposure program for students interested in how computer science, math, finance, markets, and technical problem solving connect inside Jane Street.',
    eligibilitySummary:
      'Freshman and sophomore audience from official program positioning; session-specific details vary.',
    experienceSummary:
      'Students explore trading and research, software engineering, or strategy and product tracks through lectures, hands-on activities, mock trading, probability, market structure, machine learning concepts, software design, and development practices.',
    detailBasis:
      'Current official Jane Street SEE page confirms the program and tracks; exact sessions and deadlines vary.',
    why:
      'A focused early-exposure program for students curious about the intersection of computer science, math, and finance.',
    prep:
      'Prepare to explain interest in technical problem solving, probability/math, and why a trading-technology environment is worth exploring.',
    sourceNote:
      'Official Jane Street SEE page confirms the program, three tracks, no prior finance requirement, and travel/accommodation/stipend support; exact current-cycle sessions should be checked before alerts.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jpmorgan-career-ed-you-watch',
    name: 'Career.edYOU Academy',
    organization: 'JPMorgan Chase',
    category: 'Discovery Program',
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
    description:
      'Career.edYOU Academy is a JPMorgan Chase early insight program for sophomores exploring finance, technology, and career paths.',
    eligibilitySummary:
      'U.S. college sophomores per official page; registration is currently closed.',
    experienceSummary:
      'Career exposure programming tied to JPMorgan Chase opportunities and business/technology paths.',
    detailBasis:
      'Current official JPMorgan Chase page confirms the program but says registration is closed.',
    why:
      'Bank early-insight programs can help sophomores understand financial technology roles before applying for larger internship pipelines.',
    prep:
      'Search JPMorgan Chase careers directly, confirm the program name and location, and prepare a finance-plus-technology interest story.',
    sourceNote:
      'Official JPMorganChase page confirms Career.edYOU for U.S. college sophomores and says registration is currently closed.',
    lastChecked: '2026-08-18',
  },
  {
    id: 'jpmorgan-code-for-good',
    name: 'Code for Good',
    organization: 'JPMorgan Chase',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Fall',
    status: 'open',
    confidence: 'high',
    funding: 'Free',
    location: 'Brooklyn, NY or Columbus, OH',
    url: 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210773759',
    previousUrl: 'https://www.jpmorganchase.com/careers/explore-opportunities/programs/tfsg-hackathons',
    openDate: 'Brooklyn event: October 16-17, 2026\nColumbus event: November 6-7, 2026',
    deadline: 'Brooklyn deadline: September 18, 2026\nColumbus deadline: October 9, 2026',
    tags: ['Hackathon', 'Software engineering', 'Civic tech', 'Nonprofit', 'Brooklyn', 'Columbus'],
    description:
      'Code for Good is JPMorgan Chase’s Tech for Social Good hackathon where students build technology solutions for nonprofit organizations with guidance from JPMorgan technologists.',
    eligibilitySummary:
      'Official page says Code for Good is for students enrolled in a bachelor’s degree program or a JPMorganChase-sponsored program; location-specific applications vary.',
    experienceSummary:
      'Students work in teams with technologist mentors, solve real nonprofit problems, and learn more about JPMorgan Chase technology career paths tied to specific office-location interests.',
    aboutHighlights: [
      'Brooklyn, NY: October 16-17, 2026. For students interested in Jersey City, New York, Palo Alto, Chicago, or Wilmington. Application deadline: September 18, 2026.',
      'Columbus, OH: November 6-7, 2026. For students interested in Columbus, Plano, Houston, or Tampa. Application deadline: October 9, 2026.',
    ],
    detailBasis:
      'Official JPMorgan Chase Tech for Social Good Hackathons page lists Code for Good, eligibility, locations, and the apply path.',
    why:
      'A strong event-style pathway for students to prove coding ability, social-impact interest, and teamwork before internship conversion.',
    prep:
      'Choose the event tied to your preferred office locations, prepare a resume, complete any coding challenge promptly, and be ready to discuss nonprofit problem solving and team tradeoffs.',
    sourceNote:
      'Official JPMorgan Chase candidate posting lists Brooklyn October 16-17, 2026 with a September 18 deadline, and Columbus November 6-7, 2026 with an October 9 deadline.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'bloomberg-nextgen-leadership-summit',
    name: 'NextGen Leadership Summit',
    organization: 'Bloomberg',
    category: 'Discovery Program',
    classYears: ['Sophomore'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'medium',
    funding: 'Free',
    location: 'New York, NY',
    url: 'https://bloomberg.avature.net/events/EventDetailsPage?jobId=21511&source=LinkedIn&tags=lvalleburgue',
    previousUrl: '',
    openDate: 'August 26-27, 2026 event in New York City',
    deadline: 'Application deadline was listed as August 7, 2026; use as previous-cycle context after the event',
    tags: ['Analytics', 'Sales', 'Finance', 'Leadership'],
    description:
      'Bloomberg NextGen Leadership Summit is an early-career leadership and career-readiness event for students exploring Bloomberg’s financial data, analytics, client-service, and business-technology paths.',
    eligibilitySummary:
      'External listing points to students graduating between December 2027 and May 2028 with U.S. work authorization; verify the Bloomberg Avature page before alerts.',
    experienceSummary:
      'Students attend leadership, communication, and career-readiness programming, network with Bloomberg employees and recruiters, and learn about Bloomberg products, culture, and future internship or full-time paths.',
    detailBasis:
      'User-provided Bloomberg Avature link plus external campus listing; direct source detail needs maintainer verification.',
    why:
      'Useful for students interested in finance, analytics, client-facing technology, and Bloomberg internship pathways.',
    prep:
      'Prepare finance and analytics interest, client-service examples, and verify the Avature event page before applying.',
    sourceNote:
      'Bloomberg Avature link was provided by the user; campus listings describe an August 26-27, 2026 New York event with Bloomberg business exposure and an August 7, 2026 application deadline.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-bridge-watch',
    name: 'Bridge',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Insight program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/bridge/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists Bridge as accepting applications',
    deadline: 'Verify exact session deadline by location before alerting',
    tags: ['Strategy and product', 'Trading', 'Finance', 'Insight program'],
    description:
      'Bridge is Jane Street’s daylong early insight program for first- and second-year university students exploring Strategy and Product or Institutional Sales and Trading.',
    eligibilitySummary:
      'First- and second-year university students; track and location details should be confirmed on the official page.',
    experienceSummary:
      'Students get a short, interactive look at business, product, strategy, trading, and client-facing work at Jane Street.',
    detailBasis:
      'Official Jane Street programs page lists Bridge as accepting applications.',
    why:
      'Useful for students who want to test finance, product, strategy, or trading interest before committing to a specific internship pipeline.',
    prep:
      'Prepare a short explanation of curiosity about markets, products, or client-facing work and verify the current Bridge track before applying.',
    sourceNote:
      'Official Jane Street programs page lists Bridge as an accepting program for first- and second-year university students.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-focus-watch',
    name: 'FOCUS',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['Freshman'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Multi-day program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/focus/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists FOCUS as accepting applications',
    deadline: 'Verify exact current-cycle deadline on the official page',
    tags: ['Trading', 'Technology', 'STEM access', 'Freshman'],
    description:
      'FOCUS introduces first-year university students to Jane Street’s trading and technology models through a multi-day program for students who have experienced barriers to advanced STEM access.',
    eligibilitySummary:
      'First-year university students with barriers to advanced STEM educational access; exact cycle criteria should be verified.',
    experienceSummary:
      'Students learn through finance, trading, technology, and problem-solving activities designed for early exposure.',
    detailBasis:
      'Official Jane Street programs page lists FOCUS as accepting applications.',
    why:
      'Strong freshman-facing finance and technology exposure before larger quant recruiting becomes crowded.',
    prep:
      'Prepare a concise story about STEM curiosity, barriers to access, and why trading/technology is worth exploring.',
    sourceNote:
      'Official Jane Street programs page lists FOCUS as a multi-day first-year program and marks it accepting applications.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-in-focus-watch',
    name: 'IN FOCUS',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Multi-day program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/in-focus/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists IN FOCUS as accepting applications',
    deadline: 'Verify exact current-cycle deadline on the official page',
    tags: ['Trading', 'Software engineering', 'Strategy and product', 'STEM access'],
    description:
      'IN FOCUS is a multi-day Jane Street program where undergraduates and graduate students explore trading, software development, and strategy/product teams.',
    eligibilitySummary:
      'Undergraduate and graduate students who have experienced barriers to advanced STEM educational access; exact cycle criteria vary.',
    experienceSummary:
      'Students explore Jane Street’s trading, software development, and strategy/product work through interactive programming.',
    detailBasis:
      'Official Jane Street programs page lists IN FOCUS as accepting applications.',
    why:
      'Useful for students comparing quant trading, software engineering, and strategy/product paths in one program.',
    prep:
      'Prepare examples of technical curiosity and choose which Jane Street track you want to understand best.',
    sourceNote:
      'Official Jane Street programs page lists IN FOCUS as accepting applications for students exploring trading, software development, and strategy/product teams.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-insight-watch',
    name: 'INSIGHT',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Multi-day program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/insight/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists INSIGHT as accepting applications',
    deadline: 'Verify exact current-cycle deadline on the official page',
    tags: ['Women in tech', 'Trading', 'Computer science', 'Math'],
    description:
      'INSIGHT is Jane Street’s multi-day program for self-identifying women, transgender, and gender-expansive students to learn how math and computer science are used at the firm.',
    eligibilitySummary:
      'Self-identifying women, transgender, and gender-expansive students; exact student-year and session criteria should be confirmed.',
    experienceSummary:
      'Students learn through interactive trading, software, probability, and problem-solving sessions.',
    detailBasis:
      'Official Jane Street programs page lists INSIGHT as accepting applications.',
    why:
      'A high-signal route into quant and trading exposure for students who might not otherwise see themselves in the field.',
    prep:
      'Prepare to explain interest in math, CS, markets, or technical problem solving and verify the current session details.',
    sourceNote:
      'Official Jane Street programs page lists INSIGHT as accepting applications for women, transgender, and gender-expansive students.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-jsip-watch',
    name: 'Jane Street Immersion Program',
    organization: 'Jane Street',
    category: 'Fellowship',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Summer',
    status: 'deadlineSoon',
    confidence: 'high',
    funding: 'Scholarship',
    location: 'New York, NY',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/jsip/',
    previousUrl: '',
    openDate: 'JSIP 2026 applications are listed with a February 8, 2026 deadline',
    deadline: 'Sunday, February 8, 2026 at 11:59 p.m. EST',
    tags: ['Software engineering', 'OCaml', 'Underclassmen', 'STEM access'],
    description:
      'JSIP is a multi-week summer immersion program where first- and second-year students build software engineering skills, learn OCaml and functional programming, and complete structured projects.',
    eligibilitySummary:
      'First- or second-year undergraduates with aspirations in software engineering who have experienced barriers to access and opportunity within CS.',
    experienceSummary:
      'Fellows learn from full-time Jane Street software engineers, study CS fundamentals and OCaml, build larger SWE projects, and receive a scholarship plus covered housing/travel/meals.',
    detailBasis:
      'Official JSIP page lists 2026 deadline, NYC dates, costs covered, and a $12,500 scholarship.',
    why:
      'One of the strongest underclassmen technical programs for students interested in functional programming, finance technology, and rigorous software engineering.',
    prep:
      'Prepare programming coursework evidence, project examples, and a clear explanation of barriers to CS access and technical curiosity.',
    sourceNote:
      'Official JSIP page confirms first/second-year eligibility, mid-June to mid-August NYC program timing, covered costs, and a $12,500 scholarship.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-preview-watch',
    name: 'Preview',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Daylong program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/preview/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists Preview as accepting applications',
    deadline: 'Verify exact current-cycle deadline on the official page',
    tags: ['Finance', 'Career exploration', 'Daylong program'],
    description:
      'Preview is a daylong Jane Street program for current university students, including undergraduate, graduate, and PhD students, to learn about the firm.',
    eligibilitySummary:
      'Current university students; exact session criteria should be checked before applying.',
    experienceSummary:
      'Short-format exposure to Jane Street’s people, roles, problem-solving culture, and career paths.',
    detailBasis:
      'Official Jane Street programs page lists Preview as accepting applications.',
    why:
      'Good low-commitment way to learn whether Jane Street’s finance and technical environment is worth deeper pursuit.',
    prep:
      'Use Preview as a first touchpoint, then decide whether FTTP, SEE, INSIGHT, or another track fits better.',
    sourceNote:
      'Official Jane Street programs page lists Preview as an accepting daylong program for current university students.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-qtc-watch',
    name: 'Quantitative Trading Challenge',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Multi-day program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/qtc/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists QTC as accepting applications',
    deadline: 'Verify exact current-cycle deadline on the official page',
    tags: ['Quant', 'Trading', 'Probability', 'Finance'],
    description:
      'QTC is Jane Street’s interactive multi-day program for university students to explore how math and probability concepts show up in quantitative trading.',
    eligibilitySummary:
      'University students; exact session criteria should be checked before applying.',
    experienceSummary:
      'Students work through trading, probability, and decision-making exercises that mirror the thinking behind quantitative trading.',
    detailBasis:
      'Official Jane Street programs page lists QTC as accepting applications.',
    why:
      'Good fit for students testing quant interest before committing to technical finance recruiting.',
    prep:
      'Brush up on probability, expected value, mental math, and decision-making under uncertainty.',
    sourceNote:
      'Official Jane Street programs page lists QTC as accepting applications for university students exploring quantitative trading.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-wise-watch',
    name: 'WiSE',
    organization: 'Jane Street',
    category: 'Discovery Program',
    classYears: ['Freshman'],
    timing: 'Rolling',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Multi-day program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/wise/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists WiSE as accepting applications',
    deadline: 'Verify exact current-cycle deadline on the official page',
    tags: ['Women in tech', 'Math', 'Computer science', 'Incoming college'],
    description:
      'WiSE is Jane Street’s early program for self-identifying women, transgender, and gender-expansive students about to start their first year of university.',
    eligibilitySummary:
      'Students about to start their first year of university; identity and session criteria should be verified on the official page.',
    experienceSummary:
      'Participants learn how math and computer science are used to solve real-world problems in an interactive multi-day setting.',
    detailBasis:
      'Official Jane Street programs page lists WiSE as accepting applications.',
    why:
      'Extremely early exposure for students entering college who want to understand quantitative and technical finance before recruiting starts.',
    prep:
      'Prepare a simple curiosity story around math, CS, and why early exposure would help shape your college path.',
    sourceNote:
      'Official Jane Street programs page lists WiSE as accepting applications for students about to start their first year of university.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'jane-street-amp-watch',
    name: 'Program AMP',
    organization: 'Jane Street',
    category: 'Community / Prep Program',
    classYears: ['Freshman'],
    timing: 'Summer',
    status: 'open',
    confidence: 'high',
    funding: 'Varies',
    location: 'Summer program',
    url: 'https://www.janestreet.com/join-jane-street/programs-and-events/amp/',
    previousUrl: '',
    openDate: 'Jane Street programs page currently lists AMP as accepting applications',
    deadline: 'Verify exact current-cycle deadline on the official page',
    tags: ['Incoming college', 'STEM access', 'Summer program'],
    description:
      'Program AMP is Jane Street’s five-week summer program for same-year high school graduates who have experienced barriers to advanced STEM educational access.',
    eligibilitySummary:
      'Same-year high school graduates entering college; ApplyFirst treats this as an incoming-underclassmen pathway.',
    experienceSummary:
      'Participants receive intensive STEM and technical exposure before starting college, building readiness for later university-level opportunities.',
    detailBasis:
      'Official Jane Street programs page lists AMP as accepting applications.',
    why:
      'Worth tracking because it reaches students just before college, before they would know to search underclassmen opportunity lists.',
    prep:
      'Prepare a transition-to-college story and examples of curiosity in math, technology, or STEM access.',
    sourceNote:
      'Official Jane Street programs page lists AMP as a five-week summer program for same-year high school graduates with barriers to advanced STEM access.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'capital-one-tech-summit',
    name: 'Tech Summit',
    organization: 'Capital One',
    category: 'Discovery Program',
    classYears: ['Sophomore'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Free',
    location: 'Summit format',
    url: 'https://www.capitalonecareers.com/get-ahead-with-early-career-programs-for-students',
    previousUrl: '',
    openDate: 'Capital One lists Tech Summit months as May, August, and January',
    deadline: 'Invitation or interest process varies; contact Tech Early Experiences',
    tags: ['Software engineering', 'Machine learning', 'Hardware', 'Hackathon'],
    description:
      'Capital One Tech Summit is a five-day early-career event with workshops in web development, machine learning, hardware, and a hackathon/demo experience.',
    eligibilitySummary:
      'Sophomores with beginner coding experience pursuing a CS/STEM major per Capital One’s early programs page.',
    experienceSummary:
      'Students build technical exposure, meet Capital One teams, complete a hackathon, and prepare for technology internship/development pathways.',
    detailBasis:
      'Official Capital One early programs page lists Tech Summit timing, audience, and contact path.',
    why:
      'Strong underclassmen technical exposure for students who want to prepare before standard technology internship recruiting.',
    prep:
      'Prepare beginner coding examples, project stories, and questions about technology internship pathways.',
    sourceNote:
      'Official Capital One page lists Tech Summit as a five-day program for sophomores with beginner coding experience, with May, August, and January timing.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'capital-one-product-summit',
    name: 'Product Summit',
    organization: 'Capital One',
    category: 'Discovery Program',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Spring',
    status: 'watching',
    confidence: 'high',
    funding: 'Free',
    location: 'Summit format',
    url: 'https://www.capitalonecareers.com/get-ahead-with-early-career-programs-for-students',
    previousUrl: '',
    openDate: 'Capital One lists Product Summit timing in May',
    deadline: 'Invitation or interest process varies; contact Product Experiences',
    tags: ['Product management', 'Strategy', 'Technology', 'Underclassmen'],
    description:
      'Capital One Product Summit is a two-day early program where first-year students and sophomores learn what product management looks like inside Capital One.',
    eligibilitySummary:
      'First-year students and sophomores pursuing quantitative or STEM-related majors per Capital One’s early programs page.',
    experienceSummary:
      'Students meet product managers, learn product skills, and prepare for Product Development Internship and Product Development Program pathways.',
    detailBasis:
      'Official Capital One early programs page lists Product Summit audience, May timing, and product pathway context.',
    why:
      'A rare PM-specific underclassmen signal, useful for students deciding between SWE, analyst, and product tracks.',
    prep:
      'Prepare a product curiosity story, examples of user or data thinking, and questions about the Product Development Program.',
    sourceNote:
      'Official Capital One page lists Product Summit as a May program for first-year students and sophomores interested in product management.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'capital-one-analyst-early-internship',
    name: 'Analyst Early Internship Program',
    organization: 'Capital One',
    category: 'Discovery Program',
    classYears: ['Sophomore'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid program',
    location: 'McLean, VA',
    url: 'https://www.capitalonecareers.com/early-internships-program',
    previousUrl: '',
    openDate: 'Watch fall and winter for the next summer application cycle',
    deadline: 'No related jobs are currently listed; set a job alert for openings',
    tags: ['Analytics', 'SQL', 'Business strategy', 'Data'],
    description:
      'Capital One Analyst Early Internship Program is a paid 10-week summer program for second-year students to build business analysis, SQL, and strategic problem-solving skills.',
    eligibilitySummary:
      'Second-year undergraduate students per official Capital One page; current role posting must be watched separately.',
    experienceSummary:
      'Students work on data-driven business projects, receive mentorship, and prepare for Analyst Internship or Analyst Development Program paths.',
    detailBasis:
      'Official Capital One Early Internship page confirms the program model, duration, compensation, housing, and current no-related-jobs state.',
    why:
      'A sophomore-focused paid pathway that is more targeted than a generic internship listing and useful for data/product-minded students.',
    prep:
      'Prepare SQL/data examples, business problem stories, and turn on Capital One job alerts for the next role posting.',
    sourceNote:
      'Official Capital One page confirms the 10-week paid McLean program for second-year students and says no related jobs are currently listed.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'codepath-futureforce-tech-launchpad',
    name: 'Futureforce Tech Launchpad',
    organization: 'CodePath + Salesforce',
    category: 'Community / Prep Program',
    classYears: ['Sophomore'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid program',
    location: 'San Francisco, CA',
    url: 'https://info.codepath.org/futureforce-tech-launchpad',
    previousUrl: '',
    openDate: 'Watch winter for the next application window',
    deadline: '2026 application deadline was February 22, 2026',
    tags: ['Full-stack web development', 'Salesforce', 'Mentorship', 'Pre-internship'],
    description:
      'Futureforce Tech Launchpad is a paid 10-week Salesforce pre-internship powered by CodePath with full-stack web development curriculum and 1:1 mentorship.',
    eligibilitySummary:
      'Official 2026 page targeted students age 18+ graduating in 2028 with CS or computer engineering background and CS1-level preparation.',
    experienceSummary:
      'Participants spend the summer at Salesforce Tower, learn full-stack development, build capstone-style technical work, and receive mentorship.',
    detailBasis:
      'Official CodePath page lists 2026 dates, compensation, location, eligibility, and deadline.',
    why:
      'High-value underclassmen bridge between coursework and a selective company internship pipeline.',
    prep:
      'Prepare GitHub basics, web fundamentals, a short-answer story, and availability for San Francisco summer participation.',
    sourceNote:
      'Official CodePath page confirms 10-week 2026 Futureforce Tech Launchpad details, Salesforce HQ location, paid learning experience, and February 22, 2026 deadline.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'develop-for-good-student-projects',
    name: 'Student Volunteer Projects',
    organization: 'Develop for Good',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'deadlineSoon',
    confidence: 'high',
    funding: 'Free; student grants available',
    location: 'Virtual',
    url: 'https://www.developforgood.org/for-students',
    previousUrl: '',
    openDate: 'Winter 2027 batch begins with orientation October 25-31, 2026',
    deadline: 'Student volunteer application deadline: September 19, 2026',
    tags: ['Civic tech', 'Software engineering', 'Product Management', 'Design', 'Nonprofit'],
    description:
      'Develop for Good places technology students on 16-week virtual nonprofit projects where designers, engineers, product managers, and technical/design managers build real products for social-impact clients. The Winter 2027 batch runs from late October 2026 through February 2027 with 5-10 hours per week expected.',
    eligibilitySummary:
      'University students, recent graduates with less than 2 years of general full-time work experience, bootcamp students, international students, and students on temporary leave can apply.',
    experienceSummary:
      'Students practice product, UX/UI design, frontend/web engineering, AI tooling, stakeholder management, ambiguity, teamwork, and client communication while building portfolio case studies for nonprofits.',
    detailBasis:
      'Official Develop for Good student page confirms virtual projects, free participation, career development, roles, and Fellows cash grants.',
    why:
      'Strong internship-alternative for students who need real client/project experience and portfolio proof without waiting for a company offer.',
    prep:
      'Prepare a portfolio or project link for your chosen role, examples of ownership or teamwork, and availability for the 16-week batch.',
    sourceNote:
      'Official Develop for Good page confirms 16-week virtual projects, designer/engineer/manager roles, 5-10 hours per week, September 19, 2026 student deadline, and student cash grants for selected eligible students.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'amazon-future-engineer-scholarship',
    name: 'Amazon Future Engineer Scholarship',
    organization: 'Amazon Future Engineer',
    category: 'Scholarship / Funding',
    classYears: ['Freshman'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Scholarship',
    location: 'United States',
    url: 'https://www.amazonfutureengineer.com/scholarships',
    previousUrl: '',
    openDate: '2025-2026 applications are closed; sign up for next-cycle updates',
    deadline: 'Watch for the next scholarship cycle',
    tags: ['Computer science', 'Scholarship', 'Amazon', 'High school senior'],
    description:
      'Amazon Future Engineer Scholarship combines up to $40,000 in college funding with a paid Amazon internship opportunity for eligible CS-bound students.',
    eligibilitySummary:
      'U.S. high school senior audience planning a CS-related bachelor’s path, with work authorization, financial need, and GPA requirements.',
    experienceSummary:
      'Recipients receive scholarship support, industry mentorship, and an early paid Amazon internship pathway after starting college.',
    detailBasis:
      'Official Amazon Future Engineer page confirms the scholarship/internship model and current closed status.',
    why:
      'A high-leverage pre-college-to-freshman pathway that can materially change both funding and early industry access.',
    prep:
      'Sign up for next-cycle updates and prepare financial need, CS coursework, GPA, and work authorization documentation.',
    sourceNote:
      'Official Amazon Future Engineer page confirms up to $10,000 per year for four years plus a paid Amazon internship; 2025-2026 applications are closed.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'duolingo-thrive-program-watch',
    name: 'Thrive Program',
    organization: 'Duolingo',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'medium',
    funding: 'Varies',
    location: 'Varies by role',
    url: 'https://careers.duolingo.com/?type=Thrive+Program',
    previousUrl: '',
    openDate: 'No Thrive jobs currently match the official filtered careers page',
    deadline: 'Watch Duolingo careers for Thrive Program postings',
    tags: ['Product', 'Software engineering', 'Mission-driven tech'],
    description:
      'Duolingo Thrive is tracked as a named early-career program filter on Duolingo’s careers site, but there are currently no matching open roles.',
    eligibilitySummary:
      'Eligibility depends on future Thrive postings; current official careers filter does not list active jobs.',
    experienceSummary:
      'Expected to be a Duolingo early-career pathway tied to mission-driven product, engineering, or related teams once postings appear.',
    detailBasis:
      'Official Duolingo careers page has a Thrive Program filter but currently shows no matching jobs.',
    why:
      'Worth watching because Duolingo has a strong internship and early-talent brand, but ApplyFirst should not overpromise without an active posting.',
    prep:
      'Follow Duolingo careers and prepare product/engineering stories tied to learning, experimentation, and user impact.',
    sourceNote:
      'Official Duolingo careers page filtered to Thrive Program currently shows no matching jobs, so this remains watch-only.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'citadel-discover-watch',
    name: 'Discover Citadel',
    organization: 'Citadel',
    category: 'Discovery Program',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Varies',
    location: 'New York, London, Hong Kong, or Singapore',
    url: 'https://www.citadel.com/careers/programs-and-events/',
    previousUrl: '',
    openDate: 'Watch fall and winter for upcoming Discover sessions',
    deadline: 'Exact session deadlines vary',
    tags: ['Quant', 'Finance', 'Trading', 'Underclassmen'],
    description:
      'Discover Citadel is an invitation-only two-day program for first- and second-year undergraduates to learn about Citadel and Citadel Securities.',
    eligibilitySummary:
      'First- and second-year undergraduates per official Citadel programs page.',
    experienceSummary:
      'Students get early firm exposure, meet teams, and learn about investing, trading, technology, and global markets.',
    detailBasis:
      'Official Citadel programs page lists Discover Citadel and its first/second-year undergraduate audience.',
    why:
      'A high-signal quant/finance discovery program for underclassmen before internship recruiting gets intense.',
    prep:
      'Prepare math, CS, finance curiosity stories and watch for location-specific application windows.',
    sourceNote:
      'Official Citadel programs page describes Discover Citadel as an invitation-only two-day event for first- and second-year undergraduates.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'citadel-datathon-watch',
    name: 'Datathon',
    organization: 'Citadel',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Varies',
    location: 'Competition format',
    url: 'https://www.citadel.com/careers/programs-and-events/',
    previousUrl: '',
    openDate: 'Watch Citadel programs page for upcoming Datathon events',
    deadline: 'Event deadlines vary',
    tags: ['Data science', 'Quant', 'Computer science', 'Competition'],
    description:
      'Citadel Datathon is a student competition for applying math and computer science to global markets problems, with potential interview access.',
    eligibilitySummary:
      'Undergraduates per official Citadel programs page; event-specific eligibility varies.',
    experienceSummary:
      'Students compete on data, math, and CS challenges related to markets and quantitative problem solving.',
    detailBasis:
      'Official Citadel programs page lists Datathon under undergraduate opportunities.',
    why:
      'Competition-based signal for quant/data students who want proof beyond coursework.',
    prep:
      'Practice data analysis, Python, probability, and explaining tradeoffs under time pressure.',
    sourceNote:
      'Official Citadel programs page lists Datathon for undergraduates interested in math and computer science challenges.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'citadel-trading-invitational-watch',
    name: 'Trading Invitational',
    organization: 'Citadel',
    category: 'Discovery Program',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Varies',
    location: 'Competition format',
    url: 'https://www.citadel.com/careers/programs-and-events/',
    previousUrl: '',
    openDate: 'Watch Citadel programs page for upcoming Trading Invitational events',
    deadline: 'Event deadlines vary',
    tags: ['Trading', 'Quant', 'Finance', 'Competition'],
    description:
      'Citadel Trading Invitational lets students test trading skills and experience what it feels like to work in quantitative finance.',
    eligibilitySummary:
      'Undergraduates per official Citadel programs page; event-specific eligibility varies.',
    experienceSummary:
      'Students compete in trading-style challenges and learn about decision-making in financial markets.',
    detailBasis:
      'Official Citadel programs page lists Trading Invitational under undergraduate opportunities.',
    why:
      'Useful for students who want to validate quant/trading interest through a concrete competition rather than a passive info session.',
    prep:
      'Practice probability, expected value, market intuition, and team communication.',
    sourceNote:
      'Official Citadel programs page lists Trading Invitational as an undergraduate trading-skills event.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'citadel-conference-travel-grant',
    name: 'Conference Travel Grant',
    organization: 'Citadel',
    category: 'Conference / Travel Funding',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Travel support',
    location: 'Conference travel',
    url: 'https://www.citadel.com/careers/programs-and-events/',
    previousUrl: '',
    openDate: 'Watch Citadel programs page for grant windows',
    deadline: 'Conference and grant deadlines vary',
    tags: ['STEM', 'Conference / Travel Funding', 'Quant', 'Research'],
    description:
      'Citadel Conference Travel Grant supports rising STEM talent attending conferences around the world.',
    eligibilitySummary:
      'Official page lists undergraduates, PhDs, and postdocs; specific conference eligibility varies.',
    experienceSummary:
      'Students can use travel support to attend conferences, share ideas, meet peers, and build technical networks.',
    detailBasis:
      'Official Citadel programs page lists Conference Travel Grant and its STEM travel-support purpose.',
    why:
      'Fits ApplyFirst’s funding layer because conference access can create recruiting and research visibility before students have budget.',
    prep:
      'Identify a relevant conference, prepare impact rationale, and track application windows early.',
    sourceNote:
      'Official Citadel programs page lists Conference Travel Grant for rising STEM talent including undergraduates.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'break-through-tech-ai-program',
    name: 'AI Program',
    organization: 'Break Through Tech',
    category: 'Fellowship',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid program',
    location: 'Virtual in the United States',
    url: 'https://www.breakthroughtech.org/programs/',
    previousUrl: 'https://ecornell.cornell.edu/portal/break-through-tech-ai-information/',
    openDate: 'Applications open in early December every year',
    deadline: 'Watch winter application window by cohort',
    tags: ['AI', 'Machine learning', 'Data science', 'Mentorship'],
    description:
      'Break Through Tech AI Program is a paid one-year virtual extracurricular experience for undergraduate students building machine learning, AI, and data science skills.',
    eligibilitySummary:
      'First-, second-, and third-year undergraduates at U.S.-based colleges and universities per official program page.',
    experienceSummary:
      'Students complete ML foundations, AI Studio projects with companies, mentorship, career coaching, and portfolio development.',
    detailBasis:
      'Official Break Through Tech page confirms program model, audience, annual May-April run, and early December openings.',
    why:
      'Excellent early AI pathway for students who want industry-backed projects and mentorship before applying broadly.',
    prep:
      'Submit interest form early, prepare data/project examples, and be ready for a yearlong May-April commitment.',
    sourceNote:
      'Official Break Through Tech page confirms AI Program is paid, one-year, virtual in the U.S., for 1st-3rd year undergraduates, with applications opening in early December.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'break-through-tech-sprinternship',
    name: 'Sprinternship Program',
    organization: 'Break Through Tech',
    category: 'Winternship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid program',
    location: 'Virtual, hybrid, or in person',
    url: 'https://www.breakthroughtech.org/programs/',
    previousUrl: '',
    openDate: 'Sprinternships run during January and May academic breaks',
    deadline: 'Watch cohort-specific application timing',
    tags: ['Short program', 'Tech industry', 'Resume signal'],
    description:
      'Break Through Tech Sprinternship is a paid roughly three-week immersive experience for undergraduates early in their computing studies.',
    eligibilitySummary:
      'Undergraduates at U.S.-based colleges and universities with U.S. work authorization per official page.',
    experienceSummary:
      'Students gain short-format work experience, a tech-industry resume credential, and exposure to employers before their first full-time internship.',
    detailBasis:
      'Official Break Through Tech page confirms Sprinternship timing, audience, format, and paid short-program model.',
    why:
      'Directly matches ApplyFirst’s thesis: a short early program can help students land a first full internship later.',
    prep:
      'Submit interest form, prepare a beginner-friendly technical resume, and watch January/May break timing.',
    sourceNote:
      'Official Break Through Tech page describes Sprinternships as paid roughly three-week immersive experiences during January and May breaks.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'kleiner-perkins-fellows',
    name: 'Kleiner Perkins Fellows',
    organization: 'Kleiner Perkins',
    category: 'Startup / VC Fellowship',
    classYears: ['All class years'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid placement',
    location: 'Portfolio-company dependent',
    url: 'https://www.kleinerperkins.com/fellows/',
    previousUrl: 'https://fellows.kleinerperkins.com/',
    openDate: 'Applications are currently closed; watch for next-year cycle',
    deadline: 'Next-cycle deadline not posted',
    tags: ['Startups', 'VC', 'Software engineering', 'Portfolio companies'],
    description:
      'Kleiner Perkins Fellows connects students with opportunities to work at innovative portfolio companies while receiving mentorship, curriculum, and alumni support.',
    eligibilitySummary:
      'Student eligibility and track details vary by cycle; current official page says applications are closed.',
    experienceSummary:
      'Fellows work with company partners, gain technical skills, learn from industry leaders, and join a long-term alumni community.',
    detailBasis:
      'Official Kleiner Perkins Fellows page confirms the program model and current closed status.',
    why:
      'Strong startup-placement path for students who want venture-backed company exposure instead of only big-tech pipelines.',
    prep:
      'Prepare startup-oriented project examples, identify preferred company functions, and watch for next-cycle applications.',
    sourceNote:
      'Official Kleiner Perkins Fellows page says applications are currently closed and describes partner-company work, mentorship, curriculum, and alumni support.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'bessemer-fellows-watch',
    name: 'Bessemer Fellowship Program',
    organization: 'Bessemer Venture Partners',
    category: 'Startup / VC Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Varies',
    location: 'Portfolio-company dependent',
    url: 'https://www.bvp.com/bessemer-fellows',
    previousUrl: '',
    openDate: 'Watch for a relaunched fellowship or related Bessemer student program',
    deadline: 'No active fellowship deadline; do not alert until Bessemer posts a current application',
    tags: ['Startups', 'VC', 'Portfolio companies', 'Paused program'],
    description:
      'Bessemer Fellows is tracked as a historically useful startup fellowship, but the official page says the program is paused in its current form.',
    eligibilitySummary:
      'Current fellowship eligibility is not active; Bessemer points students toward portfolio careers and the Bessemer Analyst Program.',
    experienceSummary:
      'Historically connected students to portfolio companies; current opportunity should be treated as a watch item until Bessemer relaunches it.',
    detailBasis:
      'Official Bessemer page says the fellowship is being reimagined and paused in its current form.',
    why:
      'Important to keep in the library as a watch item because students will search for it, but the status must prevent false hope.',
    prep:
      'Explore Bessemer portfolio roles and watch for a refreshed fellowship or analyst-program application page.',
    sourceNote:
      'Official Bessemer page says the Fellowship Program is paused/reimagined and points candidates toward portfolio roles and the Bessemer Analyst Program.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'eight-vc-fellowship',
    name: '8VC Fellowship',
    organization: '8VC',
    category: 'Startup / VC Fellowship',
    classYears: ['All class years'],
    timing: 'Summer',
    status: 'open',
    confidence: 'high',
    funding: 'Paid placement',
    location: 'Portfolio-company dependent',
    url: 'https://www.8vc.com/fellowships',
    previousUrl: '',
    openDate: 'Official 8VC page currently marks the fellowship as open',
    deadline: 'Verify current engineering fellowship application deadline',
    tags: ['Startups', 'VC', 'Software engineering', 'AI'],
    description:
      '8VC Fellowship is a three-month summer placement program where undergraduate students work in contributing roles at 8VC portfolio startups.',
    eligibilitySummary:
      'Undergraduate student audience per official page; specific fellowship track requirements should be checked before applying.',
    experienceSummary:
      'Fellows submit one application for many startups, work on meaningful technical problems, and gain portfolio-company exposure.',
    detailBasis:
      'Official 8VC page describes the fellowship and marks the current status as open.',
    why:
      'Strong startup and venture-backed engineering pathway for students who want high-growth company exposure.',
    prep:
      'Prepare startup-ready project examples, technical resume, and a clear interest in AI, infrastructure, healthcare, defense, or other portfolio themes.',
    sourceNote:
      'Official 8VC page describes a unique immersive three-month internship program placing undergraduates at portfolio startups and shows open status.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'thrive-capital-summer-fellowship',
    name: 'Thrive Capital Summer Fellowship',
    organization: 'Thrive Capital',
    category: 'Startup / VC Fellowship',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'high',
    funding: 'Scholarship',
    location: 'New York, NY',
    url: 'https://fellows.thrivecap.com/',
    previousUrl: '',
    openDate: '2026 application is closed; watch fall for next cycle',
    deadline: '2026 deadline was December 1, 2025',
    tags: ['VC', 'Startups', 'Founders', 'Research'],
    description:
      'Thrive Capital Summer Fellowship is a 10-week paid summer fellowship for college students to work inside Thrive Capital and learn from technology investors and portfolio companies.',
    eligibilitySummary:
      'Current college freshman, sophomore, or junior with U.S. work authorization and deep interest in technology per official 2026 page.',
    experienceSummary:
      'Fellows apprentice with a Thrive team, participate in curated events, receive mentorship, and get a grant to offset education costs.',
    detailBasis:
      'Official Thrive page lists 2026 fellowship details, eligibility, compensation, grant, and closed status.',
    why:
      'Distinctive VC/startup exposure for students deciding whether they care about founders, investing, research, or company-building.',
    prep:
      'Prepare technology thesis examples, startup curiosity, and communication stories for the next cycle.',
    sourceNote:
      'Official Thrive page says applications are closed and lists a 10-week paid fellowship, $40,000 grant, New York location, and U.S. work authorization requirement.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'hrt-women-trading-technology',
    name: 'Women in Trading Technology',
    organization: 'Hudson River Trading',
    category: 'Winternship',
    classYears: ['Freshman', 'Sophomore'],
    timing: 'Winter',
    status: 'watching',
    confidence: 'high',
    funding: 'Paid program',
    location: 'New York City',
    url: 'https://www.hudsonrivertrading.com/student-opportunities/',
    previousUrl: '',
    openDate: 'January 2026 applications are closed; watch for January 2027 applications',
    deadline: 'Applications for January 2026 are closed; next deadline not posted',
    tags: ['Trading', 'Quant', 'Women in tech', 'Finance'],
    description:
      'HRT Women in Trading Technology is a short January winternship that introduces second-year students from underrepresented backgrounds to automated trading, quantitative research, and software engineering at HRT.',
    eligibilitySummary:
      'Official HRT page describes the January 2026 program for second-year students from underrepresented backgrounds in tech and finance; check back for January 2027 applications.',
    experienceSummary:
      'Students spend 2-4 weeks in New York City learning technical facets of algorithmic trading, joining tech talks, and completing hands-on programming projects in Python and C++.',
    detailBasis:
      'Official HRT student opportunities page confirms the January 2026 Women in Trading & Technology program and says applications are closed until January 2027 updates.',
    why:
      'High-signal quant/finance discovery path for underclassmen, especially students exploring trading technology early.',
    prep:
      'Watch HRT student opportunities, prepare probability/math/programming examples, and verify the current cycle before applying.',
    sourceNote:
      'Official HRT student opportunities page says Women in Trading & Technology is a 2-4 week January program in New York City for second-year students from underrepresented backgrounds; January 2026 applications are closed and January 2027 updates are pending.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'deshaw-fellowships-watch',
    name: 'D. E. Shaw Fellowships',
    organization: 'D. E. Shaw',
    category: 'Fellowship',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'medium',
    funding: 'Stipend',
    location: 'Varies by fellowship',
    url: 'https://fellowships.deshaw.com/',
    previousUrl: '',
    openDate: 'Fellowship timing depends on the specific D. E. Shaw fellowship',
    deadline: 'Verify each fellowship deadline before alerting',
    tags: ['Quant', 'Finance', 'Fellowship', 'Stipend'],
    description:
      'D. E. Shaw Fellowships are short educational programs that expose intellectually curious students to the firm through case studies, seminars, and sessions with analysts.',
    eligibilitySummary:
      'Eligibility depends on the specific fellowship; students should verify the official fellowship page.',
    experienceSummary:
      'Fellows participate in educational sessions, technical or analytical case studies, and firm exposure programming, with stipend support in some fellowships.',
    detailBasis:
      'Official fellowship domain exists and trusted student lists describe multiple D. E. Shaw fellowship variants.',
    why:
      'Good quant/finance discovery layer for students who want structured exposure before direct internships.',
    prep:
      'Identify the specific fellowship track, prepare analytical examples, and verify deadline and eligibility on the official page.',
    sourceNote:
      'Trusted LuisaE source list describes D. E. Shaw Fellowships and points to the official fellowship domain; each fellowship should be verified individually before alerts.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'two-sigma-freshman-swe-watch',
    name: 'Freshman Software Engineering',
    organization: 'Two Sigma',
    category: 'Discovery Program',
    classYears: ['Freshman'],
    timing: 'Summer',
    status: 'watching',
    confidence: 'medium',
    funding: 'Paid program',
    location: 'New York, NY',
    url: 'https://careers.twosigma.com/careers/OpenRoles',
    previousUrl: 'https://www.twosigma.com/careers/internships/',
    openDate: 'Watch Two Sigma open roles for freshman-specific SWE postings',
    deadline: 'Current freshman-specific posting is not live',
    tags: ['Software engineering', 'Quant', 'Finance', 'Freshman'],
    description:
      'Two Sigma Freshman Software Engineering is tracked as a potential early-underclassmen quant/SWE pathway; the exact posting should appear on Two Sigma’s official open-roles board when available.',
    eligibilitySummary:
      'Freshman-specific eligibility should be confirmed from the exact open-role posting once it appears.',
    experienceSummary:
      'Expected to align with Two Sigma’s engineering internship environment: technical training, mentorship, senior-leader exposure, and project ownership.',
    detailBasis:
      'Two Sigma’s official open-roles board is the canonical place to watch for a current freshman-specific posting.',
    why:
      'Worth watching because freshman-specific quant/SWE pathways are rare and high value when they appear.',
    prep:
      'Prepare systems/programming examples and monitor Two Sigma careers for freshman-specific roles or campus-event signals.',
    sourceNote:
      'Two Sigma’s official open-roles board should show the freshman-specific SWE posting when available; ApplyFirst should not send alerts until that exact posting is live.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'nrf-foundation-scholarships',
    name: 'NRF Foundation Scholarships',
    organization: 'NRF Foundation',
    category: 'Scholarship / Funding',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'high',
    funding: 'Scholarship',
    location: 'United States',
    url: 'https://nrffoundation.org/campus/scholarships',
    previousUrl: '',
    openDate: 'Scholarship windows vary by NRF program',
    deadline: 'Track each scholarship page separately when exact dates post',
    tags: ['Scholarship', 'Retail tech', 'Conference / Travel Funding', 'Leadership'],
    description:
      'NRF Foundation Scholarships collect undergraduate funding opportunities tied to retail leadership, case competitions, student ambassadorship, technology majors, and Student Program travel.',
    eligibilitySummary:
      'Undergraduate eligibility varies by scholarship; some opportunities are tied to NRF University Member Schools, majors, retail interest, or event participation.',
    experienceSummary:
      'Students can earn tuition scholarships, case competition experience, New York Student Program travel, retail-career exposure, and leadership opportunities.',
    detailBasis:
      'Official NRF Foundation scholarships page lists several scholarship opportunities and descriptions.',
    why:
      'Keep as one umbrella record for now: it is useful funding/travel support, but each sub-scholarship only deserves its own record once timing or tech fit becomes strong enough.',
    prep:
      'Review the specific scholarship fit, especially Ray Greenly for technology/data/supply-chain majors and Rising Stars for freshmen/sophomores.',
    sourceNote:
      'Official NRF Foundation page lists Next Generation, University Challenge, Student Ambassadors, Bright Futures, Ray Greenly, and Rising Stars scholarships.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'google-scholarships-watch',
    name: 'Google Scholarships',
    organization: 'Google',
    category: 'Scholarship / Funding',
    classYears: ['All class years'],
    timing: 'Rolling',
    status: 'watching',
    confidence: 'medium',
    funding: 'Scholarship',
    location: 'Varies by scholarship',
    url: 'https://www.google.com/about/careers/applications/buildyourfuture/scholarships',
    previousUrl: 'https://buildyourfuture.withgoogle.com/scholarships/google-conference-scholarships',
    openDate: 'Watch Google Careers scholarships for US/AMER openings',
    deadline: 'Scholarship deadlines vary by program',
    tags: ['Scholarship', 'Conference / Travel Funding', 'Google', 'Access & Prep'],
    description:
      'Google Scholarships tracks Google student scholarship and conference-funding pathways; the US/AMER options should appear on the official Google Careers scholarships page when available.',
    eligibilitySummary:
      'Eligibility depends on the specific Google scholarship or conference award.',
    experienceSummary:
      'Potential support includes scholarship funding, conference access, and visibility into Google student pathways.',
    detailBasis:
      'Google Careers scholarships is the canonical watch page for US/AMER scholarship availability, but individual scholarship timing should be confirmed when listings appear.',
    why:
      'Important funding layer, but alerts should wait until a specific scholarship or conference-funding listing appears.',
    prep:
      'Track exact scholarship listings, confirm region/identity/major requirements, and avoid relying on stale Build Your Future URLs.',
    sourceNote:
      'Official Google Careers scholarships page is the canonical place to watch for US/AMER options; ApplyFirst needs program-specific scholarship pages before alerting.',
    lastChecked: '2026-08-22',
  },
  {
    id: 'acm-w-research-conference-scholarships',
    name: 'ACM-W Research Conference Scholarships',
    organization: 'ACM-W',
    category: 'Conference / Travel Funding',
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
    description:
      'ACM-W Research Conference Scholarships help students attend computing research conferences when travel funding is a barrier.',
    eligibilitySummary:
      'Students attending eligible research conferences; application timing depends on conference dates.',
    experienceSummary:
      'Travel-support funding for conference attendance, networking, and exposure to computing research communities.',
    detailBasis:
      'Current official ACM-W scholarship page lists recurring deadline groups and next listed deadline.',
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
    category: 'Community / Prep Program',
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
    description:
      'Rewriting the Code is a technical community and career-support network for women and nonbinary students in tech.',
    eligibilitySummary:
      'Student and early-career community access; individual programs and events have separate requirements.',
    experienceSummary:
      'Community programming, mentorship, career events, company access, and peer support.',
    detailBasis:
      'Current official site confirms year-round community access and programming.',
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
    category: 'Community / Prep Program',
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
    description:
      'ColorStack Membership is a community layer for Black and Latinx computer science students building networks and career access.',
    eligibilitySummary:
      'Black and Latinx undergraduate CS students in the U.S. per official student page.',
    experienceSummary:
      'Community, Slack support, events, resume visibility, career fairs, and partner opportunities.',
    detailBasis:
      'Current official ColorStack student page confirms rolling member application.',
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
    description:
      'NSF Research Experiences for Undergraduates funds undergraduate research opportunities across host sites and technical areas.',
    eligibilitySummary:
      'Undergraduate eligibility varies by REU site; students apply through host sites or NSF ETAP where applicable.',
    experienceSummary:
      'Summer research experience with faculty or lab mentors, often including stipend and research-community exposure.',
    detailBasis:
      'Current official NSF REU page confirms the site-based model; exact deadlines are host-site specific.',
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
    category: 'Scholarship / Funding',
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
    description:
      'SWE Scholarships are scholarship opportunities for women pursuing engineering, engineering technology, and related STEM paths.',
    eligibilitySummary:
      'Eligibility depends on scholarship type, academic level, major, and SWE application requirements.',
    experienceSummary:
      'Funding support rather than a work program; useful to track early because application windows vary by applicant type.',
    detailBasis:
      'Current official SWE overview says the 2026-27 cycle is closed and links to the next interest form.',
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
    category: 'Conference / Travel Funding',
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
    tags: ['GHC', 'Women in computing', 'Conference / Travel Funding'],
    description:
      'Grace Hopper Celebration scholarship tracking helps students watch for conference funding and related AnitaB.org student programs.',
    eligibilitySummary:
      'Scholarship eligibility changes by program; current official scholarship window is not fully posted.',
    experienceSummary:
      'Conference access, recruiting visibility, community programming, technical sessions, and sponsorship pathways.',
    detailBasis:
      'Current official AnitaB/GHC pages show interest-list or coming-soon status, so dates remain watch-only.',
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
