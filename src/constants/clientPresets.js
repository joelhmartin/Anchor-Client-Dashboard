const TMJ_AND_SLEEP_SERVICES = [
  'TMJ',
  'CPAP',
  'Sleep Apnea',
  'Appliance',
  'Pediatric',
  'Nightlase',
  'Sleep Study',
  'Nuvola',
  'Botox',
  'Oral Surgery',
];

export const TMJ_AND_SLEEP_SYMPTOMS = [
  'Jaw Pain',
  'Snoring',
  'Clenching',
  'Headaches',
  'Sleep Apnea',
  'Headaches',
  'Jaw Popping',
  'Popping',
  'Teeth Grinding',
  'Locked Jaw',
  'Insomnia',
  'Ear',
  'Ringing',
  'Clicking',
  'Neck Pain',
  'Jaw Pain',
  'Ringing',
  'Popping'
];

export const CLIENT_SYMPTOM_PRESETS = {
  tmj_sleep: TMJ_AND_SLEEP_SYMPTOMS
};


export const CLIENT_TYPE_PRESETS = [
  {
    value: 'medical',
    label: 'Medical',
    subtypes: [
      {
        value: 'dental',
        label: 'Dental',
        services: [
          'Dental Exam',
          'Teeth Whitening',
          'Dental Implants',
          'Root Canal Therapy',
          'Invisalign',
          'Crowns & Bridges',
          'Emergency Dentistry',
          'Pediatric Dentistry',
          'Cosmetic Dentistry',
          'Periodontal Therapy'
        ]
      },
      {
        value: 'tmj_sleep',
        label: 'TMJ & Sleep Therapy',
        services: TMJ_AND_SLEEP_SERVICES
      },
      {
        value: 'med_spa',
        label: 'Med Spa',
        services: [
          'Botox & Fillers',
          'Microneedling',
          'Laser Hair Removal',
          'Hydrafacial',
          'Chemical Peel',
          'CoolSculpting',
          'IPL Photofacial',
          'Body Contouring'
        ]
      },
      {
        value: 'chiropractic',
        label: 'Chiropractic',
        services: [
          'Spinal Adjustment',
          'Posture Correction',
          'Sports Injury Rehab',
          'Prenatal Chiropractic',
          'Massage Therapy',
          'Corrective Exercises',
          'Neck & Back Pain Relief'
        ]
      }
    ]
  },
  {
    value: 'home_service',
    label: 'Home Service',
    subtypes: [
      {
        value: 'roofing',
        label: 'Roofing',
        services: [
          'Roof Inspection',
          'Roof Repair',
          'Roof Replacement',
          'Storm Damage Repair',
          'Gutter Installation',
          'Skylight Installation'
        ]
      },
      {
        value: 'plumbing',
        label: 'Plumbing',
        services: [
          'Drain Cleaning',
          'Water Heater Repair',
          'Tankless Water Heater Install',
          'Pipe Replacement',
          'Leak Detection',
          'Sewer Line Repair'
        ]
      },
      {
        value: 'hvac',
        label: 'HVAC',
        services: [
          'AC Installation',
          'AC Repair',
          'Furnace Installation',
          'Furnace Repair',
          'Heat Pump Service',
          'Duct Cleaning',
          'Seasonal Tune-Up'
        ]
      }
    ]
  },
  {
    value: 'food_service',
    label: 'Food Service',
    subtypes: []
  }
];

export function findClientTypePreset(value) {
  return CLIENT_TYPE_PRESETS.find((preset) => preset.value === value);
}

const envPrompt =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_AI_PROMPT) ||
  (typeof process !== 'undefined' && process.env?.VITE_DEFAULT_AI_PROMPT);
export const AI_PROMPT_BASE =
  envPrompt ||
  'You are an assistant that classifies call transcripts for service businesses. Possible categories: warm (promising lead), very_good (ready to book), voicemail, unanswered, negative, spam, neutral. Return a short JSON object like {"category":"warm","summary":"One sentence summary"}';

const formatServiceLine = (services = []) => {
  const cleaned = services.filter(Boolean);
  if (!cleaned.length) return '';
  return `Services include ${cleaned.join(', ')}.`;
};

const promptFor = (typeLabel, services = []) =>
  `${AI_PROMPT_BASE} Focus the tone and examples on ${typeLabel} clients. ${formatServiceLine(services)}`;

function collectServices(typeValue, subtypeValue) {
  const typeEntry = CLIENT_TYPE_PRESETS.find((entry) => entry.value === typeValue);
  if (!typeEntry) return [];
  if (subtypeValue) {
    const subtypeEntry = typeEntry.subtypes?.find((sub) => sub.value === subtypeValue);
    if (subtypeEntry?.services?.length) {
      return subtypeEntry.services;
    }
  }
  return typeEntry.subtypes?.flatMap((sub) => sub.services || []) || [];
}

export const CLIENT_AI_PROMPTS = {
  medical: {
    description: 'medical practices',
    default: promptFor('medical practices', collectServices('medical')),
    dental: promptFor('dental clinics', collectServices('medical', 'dental')),
    tmj_sleep: promptFor('TMJ & Sleep Therapy centers', collectServices('medical', 'tmj_sleep')),
    med_spa: promptFor('medical spas', collectServices('medical', 'med_spa')),
    chiropractic: promptFor('chiropractic care studios', collectServices('medical', 'chiropractic'))
  },
  home_service: {
    description: 'home services',
    default: promptFor('home service businesses', collectServices('home_service')),
    roofing: promptFor('roofing contractors', collectServices('home_service', 'roofing')),
    plumbing: promptFor('plumbing companies', collectServices('home_service', 'plumbing')),
    hvac: promptFor('HVAC firms', collectServices('home_service', 'hvac'))
  },
  food_service: {
    description: 'food and hospitality businesses',
    default: promptFor('food service operations', collectServices('food_service'))
  }
};

export function getAiPromptForClient(type = 'medical', subtype) {
  const typeGroup = CLIENT_AI_PROMPTS[type] || CLIENT_AI_PROMPTS.medical;
  if (subtype && typeGroup[subtype]) {
    return typeGroup[subtype];
  }
  return typeGroup.default;
}
