const TMJ_AND_SLEEP_SERVICES = [
  'Jaw Pain',
  'TMJ',
  'Snoring',
  'Clenching',
  'CPAP',
  'Sleep Apnea',
  'Headaches, Jaw Pain',
  'Headaches',
  'Sleep Apnea, Snoring',
  'Headaches, Neck, Jaw Pain',
  'Jaw Popping',
  'CPAP, Snoring',
  'Popping',
  'Appliance',
  'Pediatric',
  'Teeth Grinding',
  'Locked Jaw',
  'Unknown',
  'Insomnia',
  'OSA & TMJ',
  'Ear',
  'Nightlase',
  'Sleep Study',
  'Nuvola',
  'Botox',
  'Oral Surgery',
  'Insurance',
  'Headaches, Popping',
  'Clicking',
  'Sleep Apnea, Clicking, Popping',
  'Sleep Apnea, CPAP',
  'Neck Pain',
  'Google Ads Conversion: Leads',
  'Jaw Pain, Ringing',
  'Ringing',
  'Popping, Ringing'
];

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
