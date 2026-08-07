export interface CurriculumTopic {
  id: string
  title: string
  description: string
  naccaUrl?: string
}

export interface CurriculumSubject {
  id: string
  name: string
  code: string
  category: 'core' | 'science' | 'business' | 'arts' | 'agriculture'
  description: string
  icon: string
  color: string
  topics: CurriculumTopic[]
}

export const SHS_CURRICULUM: CurriculumSubject[] = [
  // ── CORE SUBJECTS ──
  {
    id: 'core-math',
    name: 'Core Mathematics',
    code: 'MATH-C',
    category: 'core',
    description: 'Algebra, Geometry, Statistics, Vectors & Logic',
    icon: 'calculate',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    topics: [
      { id: 'number', title: 'Number & Number Systems', description: 'Integers, fractions, decimals, surds, indices, and logarithms', naccaUrl: 'https://naccaghana.org/shs/core-mathematics/number-systems' },
      { id: 'algebra', title: 'Algebraic Expressions', description: 'Simplification, factorisation, and solving linear & quadratic equations', naccaUrl: 'https://naccaghana.org/shs/core-mathematics/algebra' },
      { id: 'geometry', title: 'Geometry & Trigonometry', description: 'Angles, triangles, circles, bearings, and trigonometric ratios', naccaUrl: 'https://naccaghana.org/shs/core-mathematics/geometry' },
      { id: 'statistics', title: 'Statistics & Probability', description: 'Data collection, measures of central tendency, probability', naccaUrl: 'https://naccaghana.org/shs/core-mathematics/statistics' },
      { id: 'vectors', title: 'Vectors & Matrices', description: 'Vector operations, scalar product, matrix algebra', naccaUrl: 'https://naccaghana.org/shs/core-mathematics/vectors' },
      { id: 'functions', title: 'Functions & Graphs', description: 'Linear, quadratic, exponential functions and transformations', naccaUrl: 'https://naccaghana.org/shs/core-mathematics/functions' },
    ],
  },
  {
    id: 'english',
    name: 'English Language',
    code: 'ENG-C',
    category: 'core',
    description: 'Literature, Grammar, Essay Writing, Comprehension',
    icon: 'menu_book',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    topics: [
      { id: 'grammar', title: 'Grammar & Structure', description: 'Parts of speech, tenses, subject-verb agreement, active/passive voice', naccaUrl: 'https://naccaghana.org/shs/english/grammar' },
      { id: 'comprehension', title: 'Comprehension & Summary', description: 'Reading comprehension techniques, summary writing skills', naccaUrl: 'https://naccaghana.org/shs/english/comprehension' },
      { id: 'essay', title: 'Essay Writing', description: 'Narrative, descriptive, argumentative, and letter writing', naccaUrl: 'https://naccaghana.org/shs/english/essay-writing' },
      { id: 'literature', title: 'Literature Studies', description: 'Prose, poetry, drama analysis and literary devices', naccaUrl: 'https://naccaghana.org/shs/english/literature' },
      { id: 'vocabulary', title: 'Vocabulary & Idioms', description: 'Word formation, synonyms, antonyms, idiomatic expressions', naccaUrl: 'https://naccaghana.org/shs/english/vocabulary' },
      { id: 'oral', title: 'Oral English', description: 'Phonetics, intonation, stress patterns, and speech forms', naccaUrl: 'https://naccaghana.org/shs/english/oral-english' },
    ],
  },
  {
    id: 'integrated-science',
    name: 'Integrated Science',
    code: 'SCI-C',
    category: 'core',
    description: 'Biology, Chemistry, Physics & Agricultural Science',
    icon: 'science',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    topics: [
      { id: 'bio-cell', title: 'Cell Biology', description: 'Cell structure, organelles, cell division, and transport', naccaUrl: 'https://naccaghana.org/shs/science/cell-biology' },
      { id: 'bio-genetics', title: 'Genetics & Evolution', description: 'Heredity, Mendelian genetics, natural selection', naccaUrl: 'https://naccaghana.org/shs/science/genetics' },
      { id: 'chem-matter', title: 'Matter & Mixtures', description: 'States of matter, separation techniques, atomic structure', naccaUrl: 'https://naccaghana.org/shs/science/matter' },
      { id: 'chem-reactions', title: 'Chemical Reactions', description: 'Acids, bases, salts, oxidation, and reduction', naccaUrl: 'https://naccaghana.org/shs/science/chemical-reactions' },
      { id: 'phys-mechanics', title: 'Mechanics & Motion', description: 'Forces, energy, work, power, and Newton\'s laws', naccaUrl: 'https://naccaghana.org/shs/science/mechanics' },
      { id: 'phys-electricity', title: 'Electricity & Magnetism', description: 'Circuit theory, electromagnetic induction, AC/DC', naccaUrl: 'https://naccaghana.org/shs/science/electricity' },
    ],
  },
  {
    id: 'social-studies',
    name: 'Social Studies',
    code: 'SOC-C',
    category: 'core',
    description: 'Environment, Governance, National Unity & Culture',
    icon: 'public',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    topics: [
      { id: 'env-resources', title: 'Environmental Resources', description: 'Natural resources, conservation, and environmental issues', naccaUrl: 'https://naccaghana.org/shs/social/environmental-resources' },
      { id: 'governance', title: 'Governance & Democracy', description: 'Constitution, branches of government, civic rights', naccaUrl: 'https://naccaghana.org/shs/social/governance' },
      { id: 'culture', title: 'Culture & Socialization', description: 'Ghanaian cultures, traditions, social norms', naccaUrl: 'https://naccaghana.org/shs/social/culture' },
      { id: 'economy', title: 'National Economy', description: 'Economic activities, trade, development planning', naccaUrl: 'https://naccaghana.org/shs/social/economy' },
    ],
  },

  // ── SCIENCE PROGRAMME ELECTIVES ──
  {
    id: 'physics',
    name: 'Physics',
    code: 'PHY-E',
    category: 'science',
    description: 'Mechanics, Waves, Electricity, Modern Physics',
    icon: 'bolt',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    topics: [
      { id: 'mechanics', title: 'Classical Mechanics', description: 'Kinematics, dynamics, momentum, and projectiles', naccaUrl: 'https://naccaghana.org/shs/elective/physics/mechanics' },
      { id: 'waves', title: 'Waves & Optics', description: 'Sound, light, reflection, refraction, lenses', naccaUrl: 'https://naccaghana.org/shs/elective/physics/waves' },
      { id: 'thermo', title: 'Thermal Physics', description: 'Heat, temperature, ideal gas law, thermodynamics', naccaUrl: 'https://naccaghana.org/shs/elective/physics/thermal' },
      { id: 'em', title: 'Electromagnetism', description: 'Electric fields, capacitors, magnetic fields, induction', naccaUrl: 'https://naccaghana.org/shs/elective/physics/electromagnetism' },
      { id: 'modern', title: 'Modern Physics', description: 'Quantum theory, nuclear physics, photoelectric effect', naccaUrl: 'https://naccaghana.org/shs/elective/physics/modern' },
    ],
  },
  {
    id: 'chemistry',
    name: 'Chemistry',
    code: 'CHEM-E',
    category: 'science',
    description: 'Atomic Structure, Bonding, Energetics, Organic Chemistry',
    icon: 'chemistry',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    topics: [
      { id: 'atomic', title: 'Atomic Structure', description: 'Electron configuration, periodic trends, isotopes', naccaUrl: 'https://naccaghana.org/shs/elective/chemistry/atomic' },
      { id: 'bonding', title: 'Chemical Bonding', description: 'Ionic, covalent, metallic bonding, VSEPR theory', naccaUrl: 'https://naccaghana.org/shs/elective/chemistry/bonding' },
      { id: 'energetics', title: 'Energetics', description: 'Enthalpy, Hess\'s law, bond energies, calorimetry', naccaUrl: 'https://naccaghana.org/shs/elective/chemistry/energetics' },
      { id: 'organic', title: 'Organic Chemistry', description: 'Hydrocarbons, functional groups, reactions, polymers', naccaUrl: 'https://naccaghana.org/shs/elective/chemistry/organic' },
      { id: 'equilibrium', title: 'Chemical Equilibrium', description: 'Le Chatelier\'s principle, Kp, Kc, rates of reaction', naccaUrl: 'https://naccaghana.org/shs/elective/chemistry/equilibrium' },
    ],
  },
  {
    id: 'biology',
    name: 'Biology',
    code: 'BIO-E',
    category: 'science',
    description: 'Ecology, Genetics, Human Biology, Microbiology',
    icon: 'biotech',
    color: 'text-green-400 bg-green-500/10 border-green-500/20',
    topics: [
      { id: 'ecology', title: 'Ecology', description: 'Ecosystems, energy flow, biodiversity, pollution', naccaUrl: 'https://naccaghana.org/shs/elective/biology/ecology' },
      { id: 'genetics', title: 'Genetics & Heredity', description: 'DNA, RNA, protein synthesis, genetic engineering', naccaUrl: 'https://naccaghana.org/shs/elective/biology/genetics' },
      { id: 'human-bio', title: 'Human Biology', description: 'Circulatory, respiratory, nervous, digestive systems', naccaUrl: 'https://naccaghana.org/shs/elective/biology/human-biology' },
      { id: 'micro', title: 'Microbiology', description: 'Bacteria, viruses, fungi, disease prevention', naccaUrl: 'https://naccaghana.org/shs/elective/biology/microbiology' },
    ],
  },
  {
    id: 'elective-math',
    name: 'Elective Mathematics',
    code: 'MATH-E',
    category: 'science',
    description: 'Advanced Algebra, Calculus, Vectors, Mechanics',
    icon: 'functions',
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    topics: [
      { id: 'adv-algebra', title: 'Advanced Algebra', description: 'Polynomials, partial fractions, binomial theorem', naccaUrl: 'https://naccaghana.org/shs/elective/math/advanced-algebra' },
      { id: 'calculus', title: 'Calculus', description: 'Differentiation, integration, applications', naccaUrl: 'https://naccaghana.org/shs/elective/math/calculus' },
      { id: 'adv-trig', title: 'Trigonometry', description: 'Compound angles, identities, trig equations', naccaUrl: 'https://naccaghana.org/shs/elective/math/trigonometry' },
      { id: 'vectors', title: 'Vectors & 3D Geometry', description: 'Vector algebra, scalar product, lines & planes', naccaUrl: 'https://naccaghana.org/shs/elective/math/vectors' },
    ],
  },

  // ── BUSINESS PROGRAMME ELECTIVES ──
  {
    id: 'accounting',
    name: 'Financial Accounting',
    code: 'ACC-E',
    category: 'business',
    description: 'Bookkeeping, Financial Statements, Accounts',
    icon: 'account_balance',
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    topics: [
      { id: 'bookkeeping', title: 'Bookkeeping Basics', description: 'Double-entry system, journals, ledgers, trial balance', naccaUrl: 'https://naccaghana.org/shs/business/accounting/bookkeeping' },
      { id: 'final-accounts', title: 'Final Accounts', description: 'Trading, profit & loss, balance sheet preparation', naccaUrl: 'https://naccaghana.org/shs/business/accounting/final-accounts' },
      { id: 'control', title: 'Control Accounts', description: 'Sales ledger, purchases ledger, bank reconciliation', naccaUrl: 'https://naccaghana.org/shs/business/accounting/control-accounts' },
    ],
  },
  {
    id: 'business-mgmt',
    name: 'Business Management',
    code: 'BMG-E',
    category: 'business',
    description: 'Management, Marketing, Finance, Production',
    icon: 'business_center',
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    topics: [
      { id: 'management', title: 'Principles of Management', description: 'Planning, organising, leading, controlling', naccaUrl: 'https://naccaghana.org/shs/business/management/principles' },
      { id: 'marketing', title: 'Marketing', description: '4Ps, market research, consumer behaviour', naccaUrl: 'https://naccaghana.org/shs/business/management/marketing' },
      { id: 'finance', title: 'Business Finance', description: 'Sources of capital, budgeting, financial analysis', naccaUrl: 'https://naccaghana.org/shs/business/management/finance' },
    ],
  },
  {
    id: 'economics',
    name: 'Economics',
    code: 'ECN-E',
    category: 'business',
    description: 'Microeconomics, Macroeconomics, Development',
    icon: 'trending_up',
    color: 'text-lime-400 bg-lime-500/10 border-lime-500/20',
    topics: [
      { id: 'micro', title: 'Microeconomics', description: 'Demand & supply, elasticity, market structures', naccaUrl: 'https://naccaghana.org/shs/business/economics/micro' },
      { id: 'macro', title: 'Macroeconomics', description: 'GDP, inflation, monetary & fiscal policy', naccaUrl: 'https://naccaghana.org/shs/business/economics/macro' },
      { id: 'dev', title: 'Economic Development', description: 'Developing economies, trade, aid, industrialisation', naccaUrl: 'https://naccaghana.org/shs/business/economics/development' },
    ],
  },

  // ── GENERAL ARTS ELECTIVES ──
  {
    id: 'history',
    name: 'History',
    code: 'HIS-E',
    category: 'arts',
    description: 'West African History, World History, Ghana History',
    icon: 'history_edu',
    color: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
    topics: [
      { id: 'west-africa', title: 'West African History', description: 'Ancient empires, trade routes, pre-colonial states', naccaUrl: 'https://naccaghana.org/shs/arts/history/west-africa' },
      { id: 'colonial', title: 'Colonial Period', description: 'European colonisation, resistance, independence movements', naccaUrl: 'https://naccaghana.org/shs/arts/history/colonial' },
      { id: 'ghana', title: 'Ghanaian History', description: 'Gold Coast, independence, Fourth Republic', naccaUrl: 'https://naccaghana.org/shs/arts/history/ghana' },
    ],
  },
  {
    id: 'geography',
    name: 'Geography',
    code: 'GEO-E',
    category: 'arts',
    description: 'Physical Geography, Human Geography, Map Work',
    icon: 'map',
    color: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
    topics: [
      { id: 'physical', title: 'Physical Geography', description: 'Weather, climate, landforms, rivers, oceans', naccaUrl: 'https://naccaghana.org/shs/arts/geography/physical' },
      { id: 'human', title: 'Human Geography', description: 'Population, migration, urbanisation, agriculture', naccaUrl: 'https://naccaghana.org/shs/arts/geography/human' },
      { id: 'mapwork', title: 'Map Work & GIS', description: 'Topographic maps, interpretation, spatial analysis', naccaUrl: 'https://naccaghana.org/shs/arts/geography/mapwork' },
    ],
  },
  {
    id: 'government',
    name: 'Government',
    code: 'GOV-E',
    category: 'arts',
    description: 'Political Systems, Constitutions, International Relations',
    icon: 'balance',
    color: 'text-indigo-300 bg-indigo-400/10 border-indigo-400/20',
    topics: [
      { id: 'concepts', title: 'Basic Concepts', description: 'State, sovereignty, power, authority, legitimacy', naccaUrl: 'https://naccaghana.org/shs/arts/government/concepts' },
      { id: 'constitution', title: 'Constitutional Development', description: 'Ghana constitutions, separation of powers, fundamental rights', naccaUrl: 'https://naccaghana.org/shs/arts/government/constitution' },
      { id: 'international', title: 'International Relations', description: 'UN, AU, ECOWAS, diplomacy, conflict resolution', naccaUrl: 'https://naccaghana.org/shs/arts/government/international' },
    ],
  },
  {
    id: 'literature',
    name: 'Literature-in-English',
    code: 'LIT-E',
    category: 'arts',
    description: 'Prose, Poetry, Drama, Literary Criticism',
    icon: 'auto_stories',
    color: 'text-pink-300 bg-pink-400/10 border-pink-400/20',
    topics: [
      { id: 'prose', title: 'Prose Fiction', description: 'Novels, short stories, narrative techniques, themes', naccaUrl: 'https://naccaghana.org/shs/arts/literature/prose' },
      { id: 'poetry', title: 'Poetry', description: 'Forms, devices, analysis of prescribed poems', naccaUrl: 'https://naccaghana.org/shs/arts/literature/poetry' },
      { id: 'drama', title: 'Drama', description: 'Plays, dramatic techniques, stagecraft', naccaUrl: 'https://naccaghana.org/shs/arts/literature/drama' },
    ],
  },

  // ── AGRICULTURAL SCIENCE ──
  {
    id: 'agriculture',
    name: 'General Agriculture',
    code: 'AGR-E',
    category: 'agriculture',
    description: 'Crop Production, Animal Husbandry, Agric Economics',
    icon: 'agriculture',
    color: 'text-green-300 bg-green-400/10 border-green-400/20',
    topics: [
      { id: 'crops', title: 'Crop Husbandry', description: 'Land preparation, planting, crop protection, harvesting', naccaUrl: 'https://naccaghana.org/shs/agriculture/crops' },
      { id: 'animals', title: 'Animal Husbandry', description: 'Livestock management, nutrition, breeding, diseases', naccaUrl: 'https://naccaghana.org/shs/agriculture/animals' },
      { id: 'economics', title: 'Agricultural Economics', description: 'Farm management, marketing, agricultural policy', naccaUrl: 'https://naccaghana.org/shs/agriculture/economics' },
    ],
  },
]

export function getSubjectById(id: string): CurriculumSubject | undefined {
  return SHS_CURRICULUM.find(s => s.id === id)
}

export function getSubjectsByCategory(category: CurriculumSubject['category']): CurriculumSubject[] {
  return SHS_CURRICULUM.filter(s => s.category === category)
}
