## ADDED Requirements

### Requirement: Cassette Futurism Design System

The admin console SHALL implement a Cassette Futurism visual design language that provides:

1. **Color System**: A monochromatic amber color palette (#FFBF00) with deep black backgrounds (#0A0A0A), including complete token coverage for:
   - Primary, secondary, and status colors
   - Neutral surface scale (surface-100 through surface-600)
   - Functional tokens: disabled, divider, overlay, focus
2. **Typography**: Monospace fonts (JetBrains Mono) for data/UI chrome, sans-serif (Inter) for body text, pixel fonts (VT323) for display elements, with CJK fallbacks
3. **Shape System**: Angular corners and beveled edges instead of rounded corners
4. **Effects**: Subtle CRT-inspired effects including scanlines, glow, and noise textures, with defined usage limits and intensity caps
5. **Components**: All UI components styled to match the retro-futuristic aesthetic with complete state coverage (default, hover, focus, active, disabled, error)

The design system SHALL maintain WCAG 2.1 AA accessibility standards for color contrast (minimum 4.5:1 for normal text, 3:1 for large text).

#### Scenario: User views the dashboard

- **WHEN** a user navigates to the dashboard page
- **THEN** the interface displays with amber-on-black color scheme
- **AND** text uses appropriate fonts (mono for data, sans for descriptions)
- **AND** panels have angular borders with subtle glow effects
- **AND** color contrast ratio meets WCAG 2.1 AA (>= 4.5:1)

#### Scenario: User interacts with buttons

- **WHEN** a user hovers over a button
- **THEN** the button displays a glow effect
- **AND** the transition is smooth (200ms)

#### Scenario: User views tables

- **WHEN** a user views a data table
- **THEN** the table headers use uppercase monospace text
- **AND** rows are separated by dashed lines
- **AND** hovering a row highlights it with a subtle background change

#### Scenario: User views disabled element

- **WHEN** an element is in disabled state
- **THEN** the element uses disabled tokens (--cf-disabled-text: #666666)
- **AND** the contrast ratio still meets minimum accessibility requirements (>= 3:1)
- **AND** the disabled state is visually distinct without relying solely on color

### Requirement: Keyboard Accessibility

All interactive elements SHALL be fully accessible via keyboard navigation with visible focus indicators.

#### Scenario: User navigates with keyboard

- **WHEN** a user presses Tab to navigate through the interface
- **THEN** focus moves to the next interactive element in logical order
- **AND** the focused element displays a visible focus ring (2px amber outline with 2px offset)
- **AND** the focus indicator has sufficient contrast against the background

#### Scenario: User activates button with keyboard

- **WHEN** a user focuses on a button and presses Enter or Space
- **THEN** the button action is triggered
- **AND** the active state is visually indicated

#### Scenario: User navigates form fields

- **WHEN** a user tabs through a form
- **THEN** each form field receives focus in logical order
- **AND** the focused field displays a glow effect on its border
- **AND** screen readers announce the field label and current value

### Requirement: Dark Theme Only

The admin console SHALL support only a dark theme (deep black background with amber text) to maintain the Cassette Futurism aesthetic consistency.

#### Scenario: User visits any page

- **WHEN** a user visits any page in the admin console
- **THEN** the page displays in dark theme
- **AND** the color scheme uses black backgrounds (#0A0A0A to #242424)
- **AND** the primary text color is amber (#FFBF00)

### Requirement: Reduced Motion Support

The admin console SHALL respect user preferences for reduced motion and provide an optional manual toggle.

#### Scenario: User has prefers-reduced-motion enabled

- **WHEN** a user has `prefers-reduced-motion: reduce` set in their OS
- **THEN** all animations are disabled or reduced to minimal duration (< 10ms)
- **AND** scanline and noise effects are not displayed
- **AND** glow effects on text are removed
- **AND** the cursor blink animation is stopped

#### Scenario: User enables minimal effects mode

- **WHEN** a user toggles the "minimal effects" option in settings
- **THEN** CRT effects (scanlines, noise, glow) are disabled
- **AND** the preference is persisted in localStorage
- **AND** the interface remains fully functional

### Requirement: High Contrast Support

The admin console SHALL adapt to high contrast mode preferences.

#### Scenario: User has prefers-contrast: more enabled

- **WHEN** a user has `prefers-contrast: more` set in their OS
- **THEN** CRT effects (scanlines, noise) are disabled
- **AND** text glow effects are replaced with increased font weight
- **AND** divider colors are made more prominent
- **AND** all color contrasts exceed WCAG AAA requirements (7:1)

### Requirement: Performance Constraints

CRT visual effects SHALL NOT significantly impact page performance. Each page route SHALL meet defined performance budgets.

#### Scenario: Dashboard page loads on desktop

- **WHEN** the Dashboard page loads on a desktop browser
- **THEN** Lighthouse Performance score is >= 90
- **AND** Largest Contentful Paint (LCP) is < 2.5 seconds
- **AND** Cumulative Layout Shift (CLS) is < 0.1
- **AND** Interaction to Next Paint (INP) is < 200ms

#### Scenario: Dashboard page loads on mobile

- **WHEN** the Dashboard page loads on a mobile browser
- **THEN** Lighthouse Performance score is >= 80
- **AND** Largest Contentful Paint (LCP) is < 4 seconds
- **AND** Cumulative Layout Shift (CLS) is < 0.25
- **AND** Interaction to Next Paint (INP) is < 300ms

#### Scenario: Page with CRT effects loads

- **WHEN** a page with scanline effects loads
- **THEN** no layout shift occurs due to effect application
- **AND** the scanline effect does not cause frame drops below 60fps during scroll

### Requirement: Non-Color Status Indicators

Status information SHALL be conveyed through multiple means, not relying solely on color.

#### Scenario: User views success status

- **WHEN** an element displays a success status
- **THEN** the status is indicated by green color (#00FF41)
- **AND** an accompanying icon (checkmark) is displayed
- **AND** a text label describes the status

#### Scenario: User views error status

- **WHEN** an element displays an error status
- **THEN** the status is indicated by red color (#FF3131)
- **AND** an accompanying icon (X or exclamation) is displayed
- **AND** a text label describes the error

## MODIFIED Requirements

### Requirement: Admin Console Visual Identity

The admin console SHALL present a distinctive visual identity that differentiates AutoRouter from generic SaaS dashboards through a Cassette Futurism aesthetic inspired by 1980s-90s science fiction interfaces.

The visual design SHALL convey professionalism, technical competence, and reliability appropriate for an AI API Gateway product while maintaining full accessibility compliance.

#### Scenario: User first impression

- **WHEN** a user first visits the admin console
- **THEN** the interface immediately communicates a unique, technical aesthetic
- **AND** the design feels intentional and cohesive rather than template-based
- **AND** the interface is usable without visual effects enabled
