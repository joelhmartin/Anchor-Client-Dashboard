# 💻 Agent Development Checklist: Client Portal & Admin Hub

## 1. Global Plugin Behavior & Configuration
* [ ] **Environment configuration**
    * [ ] Load secrets and settings from environment (equivalents of:
        * [ ] Mail sending API key and domain
        * [ ] From email and from name
        * [ ] A dev/sandbox flag for email behavior)
* [ ] **Core options store**
    * [ ] Store global settings for:
        * [ ] Monday API token
        * [ ] Monday reference board id
        * [ ] Monday column ids (client identifier, person, status, due date, file uploads)
        * [ ] Monday default person id for requests
        * [ ] Monday default status label for new items
        * [ ] Default Looker (analytics) URL
        * [ ] Default shared documents list (label + URL + id)
        * [ ] Portal URL (client hub route)
        * [ ] Login URL (front login route)
        * [ ] Admin hub URL (front admin hub route or fallback to admin UI)
* [ ] **Activation behavior**
    * [ ] Create a “client” role or equivalent with:
        * [ ] Permission to sign in
        * [ ] Permission to upload files for docs and brand assets

---

## 2. User Model & Per-Client Metadata
* [ ] **Analytics & reporting**
    * [x] Per user analytics URL (overrides default Looker URL)
* [ ] **Monday integration**
    * [x] Board id
    * [x] “New request” group identifier (id or name)
    * [x] “Active tasks” group identifier (id or name)
    * [x] “Completed tasks” group identifier (id or name)
    * [x] Client identifier value for Monday column
    * [x] Person id for assignee on Monday items
    * [ ] Account manager mapping:
        * [ ] Account manager user id
        * [x] Optional override “account manager person id” for Monday if different
* [ ] **Call tracking & AI classification**
    * [x] CallTracking account id
    * [x] CallTracking API key
    * [x] CallTracking API secret
    * [ ] OpenAI API key
    * [x] Per client “call classification prompt” text, falling back to a default if empty
* [ ] **Brand profile**
    * [ ] Structured brand data object:
        * [x] Logos (array of files: id, name, label, url, type, etc)
        * [x] Style guide files
        * [x] Brand notes (colors, fonts etc)
        * [x] Website admin email
        * [x] GA / GTM emails
        * [x] Meta Business Manager email
        * [x] Social links
        * [x] Pricing list URL
        * [x] Promo calendar URL
* [x] **Client document center**
    * [x] Per user “client docs” list (see section 6)
* [ ] **Profile & avatar**
    * [ ] Custom avatar file for user, plus a “last updated” timestamp so you can force cache-busting
    * [ ] Standard profile fields: display name, email, password

---

## 3. Authentication, Routing & Role Based Behavior
* [ ] **Login routing**
    * [ ] Front login page:
        * [ ] If user visits traditional login path, redirect to your custom login URL, preserving redirect target
    * [ ] On successful login:
        * [ ] Decide destination based on role:
            * [ ] Client → client portal URL
            * [ ] Admin / staff → admin hub URL (or admin area)
* [ ] **Admin access restrictions**
    * [x] Prevent clients from accessing admin area routes and redirect them to client portal
* [ ] **Avatar resolution**
    * [ ] Resolve avatar URL using user meta if present, otherwise fallback to default avatar
    * [ ] Append version query string based on “avatar updated” timestamp
* [ ] **Hide admin chrome for clients**
    * [ ] Hide any admin navigation / bars for non admin users in the React environment

---

## 4. Asset Bootstrapping into React
* [ ] **Expose global config to React**
    * [ ] API base URL for AJAX calls
    * [ ] CSRF / nonce token
* [ ] **For logged-in user**
    * [ ] id, display\_name, user\_email
    * [ ] avatar\_url (with cache bust)
    * [ ] meta (Monday, analytics, call tracking, OpenAI keys as needed)
    * [ ] brand data object
    * [ ] docs list (merged default docs + user docs, if you want to prehydrate)
* [ ] **Conditional loading**
    * [ ] Only mount the React client hub/admin hub where needed:
        * [ ] On routes that correspond to client hub, login, admin hub, profile, button components etc

---

## 5. Front-End Client Portal UI (React Components)

### 5.1 Hub shell (client hub)
* [ ] Client hub container
* [ ] Tabbed interface with tabs:
    * [ ] Analytics
    * [ ] Tasks
    * [ ] Request
    * [ ] Brand
    * [ ] Calls
    * [ ] Docs
    * [ ] Profile
* [ ] Support default\_tab selection using URL or props
* [ ] Tab state, ARIA attributes and styling
* [ ] Each tab renders its own React child component

### 5.2 Login & profile
* [ ] **Login form component**
    * [ ] Email + password fields
    * [ ] Submit to front login API endpoint
    * [ ] Show errors and success
    * [ ] After successful login:
        * [ ] Redirect based on role portal URL
    * [ ] If user is already logged in:
        * [ ] Show “Go to Client Hub” or “Go to Admin Hub” button
        * [ ] Show “Log out” link
* [ ] **Profile tab component**
    * [ ] Display current avatar, name, email
    * [ ] Avatar upload control (with hidden file input and drop zone)
    * [ ] Profile form fields:
        * [ ] First name
        * [ ] Last name
        * [ ] Display name
        * [ ] Email
        * [ ] Current password (optionally for security)
        * [ ] New password and confirm
    * [ ] Submit to “save profile” endpoint
    * [ ] Show result messages
    * [ ] Avatar upload flow:
        * [ ] Upload file to avatar endpoint
        * [ ] Update avatar URL in client state with new version parameter

### 5.3 Analytics tab
* [ ] Analytics embed component
    * [ ] Determine URL as:
        * [ ] Per user analytics URL if set
        * [ ] Otherwise default analytics URL from settings
    * [ ] If no URL configured:
        * [ ] Render “not configured” message
    * [ ] Responsive iframe wrapper

### 5.4 Tasks tab
* [ ] Tasks list component
    * [ ] Inner tabs: Active / Completed
    * [ ] For each view:
        * [ ] Fetch tasks from “get tasks” endpoint with type=active or completed
        * [ ] Render table with:
            * [ ] Task name
            * [ ] Status
            * [ ] Due date
            * [ ] Assigned to
            * [ ] Last update summary
        * [ ] Click row to open “Task updates” modal
    * [ ] Task updates modal
        * [ ] Show item name
        * [ ] Item details table (status, due date, created at, etc)
        * [ ] List of updates with text and author
        * [ ] List of files attached to item
        * [ ] Close button

### 5.5 Submit request tab
* [ ] New request form component
    * [ ] Fields:
        * [ ] Request title (required)
        * [ ] Request details (textarea)
        * [ ] Desired due date (date input)
        * [ ] Rush job toggle:
            * [ ] Hidden field storing 0 or 1
            * [ ] Button “I need this done today” that toggles it
        * [ ] Optional file upload (single file):
            * [ ] “Select File” button
            * [ ] Drag and drop area
            * [ ] File list display
    * [ ] Submit to “submit request” endpoint
    * [ ] Use user’s Monday board id and “new request” group id
    * [ ] Show result and clear form / files on success

### 5.6 Brand profile tab
* [ ] Brand profile form
    * [ ] Logos section:
        * [ ] “Select logos” button
        * [ ] Drag & drop area
        * [ ] Multiple file upload
        * [ ] List existing logo files with name and actions (view, download, delete)
    * [ ] Style guide section:
        * [ ] Similar UI for style guide files
    * [ ] Brand notes:
        * [ ] Textarea for colors, fonts, notes
    * [ ] Access & links:
        * [ ] Website admin access email
        * [ ] GA / GTM emails
        * [ ] Meta Business Manager email
        * [ ] Social links
        * [ ] Pricing list URL
        * [ ] Promo calendar URL
    * [ ] Submit to “save brand” endpoint
    * [ ] Show result feedback

### 5.7 Call activity tab
* [ ] Call log component
    * [ ] Header showing purpose and description
    * [ ] View toggle tabs:
        * [ ] Call List
        * [ ] Insights
    * [ ] Toolbar:
        * [ ] “Reload calls” button:
            * [ ] Hits get\_call\_logs endpoint
            * [ ] Optionally allow “force reload” to bypass cache
        * [ ] Activity type filter:
            * [ ] All, phone, SMS, form, other
        * [ ] Time range selector (if implemented in JS; the current code uses a cutoff behind the scenes, but you may want UI)
        * [ ] Source filter:
            * [ ] Populated dynamically based on call sources from data
    * [ ] Call list
        * [ ] Category filter chips:
            * [ ] All, Warm, Very Good, Voicemail / Unanswered, Negative, Spam
        * [ ] List of calls with:
            * [ ] Date & time
            * [ ] Caller name and number
            * [ ] Source (tracking number or campaign)
            * [ ] Activity type
            * [ ] Duration or status
            * [ ] Classification category (warm, very\_good etc) and summary
            * [ ] Rating (1–5) with interactive controls
            * [ ] Link to recording and transcript if available
        * [ ] Rating interactions:
            * [ ] Rate call -> POST to score\_call endpoint and update CTM “sale”
            * [ ] Clear rating -> POST to clear\_call\_score
    * [ ] Call details pane:
        * [ ] When clicking a call, show:
            * [ ] Full transcript
            * [ ] Message content or form submission details, formatted neatly
            * [ ] Recording link
            * [ ] Internal notes, classification summary
    * [ ] Insights view
        * [ ] Aggregate counts by category (warm, very\_good, etc)
        * [ ] Aggregate counts by source
        * [ ] Show these as text, cards or charts

---

## 6. Document Center Tab
* [ ] **Upload section**
    * [ ] “Select files to upload” button
    * [ ] Drag & drop area
    * [ ] Multiple file upload (client\_doc)
    * [ ] Display newly selected files with names and sizes
    * [ ] On submit, call “upload\_doc” endpoint:
        * [ ] For each uploaded file, store metadata:
            * [ ] id, label, name, url, type (client), origin (client), review\_status (none, pending, viewed), uploaded\_by, uploaded\_at, review\_requested\_at, viewed\_at
    * [ ] Show success or error message
* [ ] **Shared documents list**
    * [ ] Render combined list of:
        * [ ] Default docs configured globally
        * [ ] Client specific docs
    * [ ] For each doc:
        * [ ] Show label and badges:
            * [ ] “For Review” when review\_status = pending
            * [ ] “Viewed” when viewed\_status = viewed
        * [ ] Clicking label opens url in new tab
    * [ ] For non default docs:
        * [ ] Delete button that calls delete\_doc endpoint
        * [ ] On click, optionally call “mark\_doc\_viewed” endpoint to update review\_status and viewed\_at
* [ ] **Admin document actions**
    * [x] Admin upload docs to client (admin\_upload\_doc endpoint)
    * [x] Admin mark doc review state (admin\_mark\_doc\_review):
        * [x] none, pending, viewed
    * [ ] On “pending” state, send email to client

---

## 7. Admin Hub UI (React Components)

### 7.1 Admin hub shell
* [ ] Admin hub component
    * [ ] Restricted to admins
    * [ ] Tabs:
        * [ ] Clients
        * [ ] Profile
    * [ ] Tab state with ARIA attributes

### 7.2 Clients tab
* [x] **Add client card**
    * [x] Simple form:
        * [x] Client name
        * [x] Client email
    * [x] Submits to “upsert client account” handler
    * [x] Creates or updates user account and sets role to client
    * [x] Show success or error notice including user id
* [x] **All clients list**
    * [x] Table with:
        * [x] Display name
        * [x] Email
        * [x] Analytics URL
        * [x] Monday board id
        * [x] Active and completed group ids or names
        * [x] Link to edit user in admin or open detailed editor in React
* [x] **Client editor panel** (Details subtab)
    * [x] Load selected client via “get\_client\_details” endpoint
    * [x] Form fields:
        * [x] Display name, Email, Analytics URL (per user), Client identifier value
        * [x] Monday board select (populated via Monday boards API)
        * [x] Account manager select (list of users with some capability)
        * [x] New request group select, Active tasks group select, Completed tasks group select
        * [x] Monday person id override (optional)
    * [x] “Save changes” button -> POST to save\_client\_details
    * [ ] “Clear selection” button to reset editor
* [x] **Client editor panel** (Brand subtab)
    * [x] Read-only brand assets display using same brand\_data shape as client hub
* [x] **Client editor panel** (Docs subtab)
    * [x] List client docs
    * [x] Upload new docs on behalf of client
    * [x] Mark docs for review / mark viewed
    * [x] Delete docs

### 7.3 Admin profile tab
* [ ] Profile form for admin user
    * [ ] Same fields and avatar handling as client profile tab
    * [ ] Reuse same endpoints

---

## 8. Global Admin Settings UI
* [ ] **APIs section**
    * [ ] Fields:
        * [ ] Monday API token (masked), Monday reference board id, Monday client column id, Monday person column id, Monday default person id, Monday status column id, Monday default status label, Monday due date column id, Monday client files column id
        * [ ] Default Looker URL
* [ ] **Default docs section**
    * [ ] React document picker for default docs:
        * [ ] Use your media system to select files
        * [ ] For each selected file, store: id, url, label (editable)
        * [ ] Support removing docs
        * [ ] Maintain hidden JSON representation in settings store
* [ ] **Pages & redirects section**
    * [ ] Fields:
        * [ ] Portal page path, Login page path, Admin hub page path
    * [ ] Sanitize as relative paths, with defaults: Portal /, Login /login, Admin hub fallback to admin UI path if not set
* [ ] **Per user “Client Hub Settings” section**
    * [ ] On user admin screen, show:
        * [ ] Monday & analytics fields (same as user meta list above)
        * [ ] CallTracking credentials, OpenAI API key and call classification prompt
        * [ ] Brand data summary (logos, style guide, notes, links)
        * [ ] Client uploaded documents summary
* [ ] **Shortcodes / integration help**
    * [ ] Replace with documentation somewhere in your React based admin to explain: Client hub component, Login component, Docs component, Admin hub component, Buttons for login, logout, my account, admin hub

---

## 9. Integrations Logic on the Backend
### 9.1 Monday integration
* [ ] Core helper
    * [x] Function to send queries/mutations to Monday API with token
    * [ ] Helper to upload files and attach to updates/items
    * [ ] Helper to resolve group identifier (id or name) into group id
* [ ] Endpoints
    * [x] List boards for authenticated user (for admin selectors)
    * [x] List groups for selected board
    * [x] List columns for selected board
    * [x] List people/team for assignment selectors
    * [x] Create item on client board in correct group when a request is submitted
        * [x] Populate column values: Status, Due date, Client identifier, Person (account manager)
        * [ ] Attach uploaded file if present
    * [ ] Read items & updates for get\_tasks endpoint, grouped into active/completed sets
    * [x] Normalize Monday item data into a task shape used by React

### 9.2 CallTracking integration
* [ ] Credentials resolution
    * [ ] Pull account id, api key, secret from user meta
* [ ] Fetch calls
    * [ ] Query calls within a time window
    * [ ] Normalize responses from different shapes into a unified call object with: id, call\_time, timestamp, unix\_time, source and normalized source key, direction and type (call, sms, form, other), caller details (name, number, region), campaign / tracking info, disposition, duration, recording url, transcript text (if available), message payload or form submission details formatted into human readable content
* [ ] Caching
    * [ ] Cache calls per user with: calls array, fetched\_at timestamp, TTL for cache
    * [ ] Endpoint to clear cache (reset\_call\_cache)
* [ ] Scoring calls
    * [x] Store per call “rating” 1–5 in persistent store
    * [ ] Post “sale” or equivalent rating back to CallTracking API when user scores a call
    * [x] Clear rating when requested, and optionally notify CallTracking

### 9.3 AI classification
* [ ] Key resolution
    * [ ] Resolve OpenAI key from user meta
* [ ] Prompting
    * [ ] Use per user prompt if set, otherwise default prompt text describing business and expected JSON output
* [ ] Classification logic
    * [ ] Build classifier input from: Transcript, Message body or form details
    * [ ] Call chat completion endpoint
    * [ ] Parse JSON or text response into: category, summary
    * [ ] Normalize category to standard set: warm, very\_good (or similar), voicemail, unanswered, negative, spam, neutral, unreviewed
    * [ ] Cache AI classification per call id so you do not reclassify every time
    * [ ] Integrate classification into get\_call\_logs payload

### 9.4 Document email notifications
* [ ] Email sender abstraction
    * [ ] Send HTML + plain-text email using: Either a mail service API or your default mail function
    * [ ] Use environment values for: From email, From name
    * [ ] Optional dev mode flag to change behavior in non-prod
* [ ] Document email template
    * [ ] HTML email template with: Greeting using client name, Intro text, Document label, Button “Open Client Hub” (or configurable label) pointing directly to doc route
    * [ ] Plain text fallback version
* [ ] Trigger
    * [ ] When admin marks a doc as “pending” for review: Send notification email to client using this template

---

## 10. File Handling, Storage & Validation
* [ ] **Supported file types**
    * [ ] Allow brand asset uploads of ai, eps, svg in addition to common image types
* [ ] **Storage model for files**
    * [ ] Consistent structure for all stored file references: id, label, name, url, type (default, client, brand\_logo, brand\_style\_guide, etc), origin (default or client), review\_status, uploaded\_by, uploaded\_at, review\_requested\_at, viewed\_at
* [ ] **Size & error handling**
    * [ ] Appropriately handle upload errors and return user-friendly messages
    * [ ] Ensure limits for file size and count are implemented
