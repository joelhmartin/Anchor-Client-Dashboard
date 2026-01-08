import { FormControlLabel, Link, Paper, RadioGroup, Stack, Typography } from '@mui/material';
import CheckboxRadio from './CheckboxRadio';

export default function GoogleAdsStep({ access, setAccessStatus }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Google Ads</Typography>
      <Typography variant="body2" color="text.secondary">
        We need administrative access to your Google Ads account so we can manage campaigns, conversions, budgets, and integrations with analytics.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">How to grant access</Typography>
        <Link href="https://support.google.com/google-ads/answer/6372672?sjid=11176952801985058373-NA" target="_blank" rel="noreferrer">
          Google Ads access instructions
        </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please add: <strong>access@anchorcorps.com</strong> (Admin access)
        </Typography>
      </Paper>
      <RadioGroup
        value={access.google_ads_access_status}
        onChange={(_e, v) =>
          setAccessStatus('google_ads_access_status', v, (val) => ({
            google_ads_access_provided: val === 'provided',
            google_ads_access_understood: val === 'will_provide'
          }))
        }
      >
        <FormControlLabel value="no_google_ads_account" control={<CheckboxRadio />} label="I do not have a Google Ads account" />
        <FormControlLabel value="no_google_ads_history" control={<CheckboxRadio />} label="I have not run Google Ads before" />
        <FormControlLabel
          value="agency_owns_google_ads"
          control={<CheckboxRadio />}
          label="I am running Google Ads but my agency owns the account. We may need to start a new Google Ads account"
        />
        <FormControlLabel value="provided" control={<CheckboxRadio />} label="I have provided access" />
        <FormControlLabel
          value="will_provide"
          control={<CheckboxRadio />}
          label="I have access and will be providing to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel
          value="not_running_google_ads"
          control={<CheckboxRadio />}
          label="Anchor Corps will not be running Google Ads for my business initially"
        />
        <FormControlLabel
          value="need_help"
          control={<CheckboxRadio />}
          label="Please help!  I don’t know who has administrative access to my Google Ads account"
        />
      </RadioGroup>
    </Stack>
  );
}


