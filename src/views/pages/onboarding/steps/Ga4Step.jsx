import { FormControlLabel, Link, Paper, RadioGroup, Stack, Typography } from '@mui/material';
import CheckboxRadio from './CheckboxRadio';

export default function Ga4Step({ access, setAccessStatus }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Google Analytics (GA4)</Typography>
      <Typography variant="body2" color="text.secondary">
        We need <strong>Admin access</strong> to your Google Analytics property so we can configure tracking, conversions, events, integrations,
        and reporting.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">How to grant access</Typography>
        <Link href="https://support.google.com/analytics/answer/1009702" target="_blank" rel="noreferrer">
          Google Analytics access instructions
        </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please add: <strong>access@anchorcorps.com</strong> (Admin access)
        </Typography>
      </Paper>
      <RadioGroup
        value={access.ga4_access_status}
        onChange={(_e, v) =>
          setAccessStatus('ga4_access_status', v, (val) => ({
            ga4_access_provided: val === 'provided',
            ga4_access_understood: val === 'will_provide'
          }))
        }
      >
        <FormControlLabel value="no_ga4_setup" control={<CheckboxRadio />} label="I do not have Google Analytics / GA4 set up yet" />
        <FormControlLabel
          value="agency_controls_ga4"
          control={<CheckboxRadio />}
          label="My agency/vendor controls GA4 access. I may need help getting Anchor added as an admin"
        />
        <FormControlLabel
          value="not_ga4"
          control={<CheckboxRadio />}
          label="We are using a different analytics setup (not GA4) and need guidance"
        />
        <FormControlLabel value="provided" control={<CheckboxRadio />} label="I have provided access" />
        <FormControlLabel
          value="will_provide"
          control={<CheckboxRadio />}
          label="I have access and will be providing to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel
          value="not_running_ga4"
          control={<CheckboxRadio />}
          label="Anchor Corps will not be managing GA4 for my business initially"
        />
        <FormControlLabel
          value="need_help"
          control={<CheckboxRadio />}
          label="Please help! I don’t know who has administrative access to my Google Analytics account"
        />
      </RadioGroup>
    </Stack>
  );
}


