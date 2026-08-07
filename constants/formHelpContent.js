/**
 * In-app help copy for forms.
 * Optional images: drop files under assets/help/ and require() them in a section:
 *   image: require("../assets/help/waste-stick.png"),
 *   caption: "Read the stick at liquid level.",
 */

export const WASTE_FORM_HELP = {
  title: "How to log waste",
  intro:
    "Use a measuring stick in the waste drum, enter inches for each material, and the app converts to gallons automatically.",
  sections: [
    {
      heading: "1. Date & name",
      body: "Confirm the date of the measurement and your name so the record can be tracked.",
    },
    {
      heading: "2. Stick measure (inches)",
      body: "Dip the stick straight into the drum and read the liquid height in inches for each material (Paint, Clear, Primer, Acetone).",
      bullets: [
        "Enter inches — gallons update under each field (0.37 gal per inch).",
        "Press Enter / Next to jump to the next material field.",
        "Leave a field blank or 0 if that material was not measured.",
      ],
    },
    {
      heading: "3. Total & Save",
      body: "Check the total gallons, then tap Save. Admins can copy a week’s totals as a table for Excel.",
    },
    {
      heading: "Tips",
      bullets: [
        "Measure with the drum on level ground.",
        "Wipe the stick between materials if drums are separate.",
        "If a number looks off vs last week, double-check the stick reading before saving.",
        "Pull to refresh updates the date to today.",
      ],
    },
  ],
};

export const MATERIAL_USAGE_FORM_HELP = {
  title: "How to log material usage",
  intro:
    "Log each mix you spray: when, which booth, which job, which material, and how much.",
  sections: [
    {
      heading: "1. Date & time",
      body: "Set when the mix was used. On phones, tap Time to scroll hour, minute, and AM/PM. Pull to refresh resets these to now.",
    },
    {
      heading: "2. Booth",
      body: "Select the booth where you sprayed (Booth 1&3, Booth 2, or Booth 4). Do this before filling the rest of the form.",
    },
    {
      heading: "3. Job number",
      body: "Enter the job / work order number for this spray. For Booth 2, the job number is optional.",
    },
    {
      heading: "4. Material",
      body: "Type in the Material field to search inventory live.",
      bullets: [
        "After 2+ letters, up to 5 matching paints / clears / primers appear — tap one to select.",
        "For custom materials (dye, stain, toner), type the description and choose “Use custom”, or just leave it typed and submit.",
        "Custom entries must include the word dye, stain, or toner so the type is clear.",
        "Use ✕ to clear the selection and search again.",
      ],
    },
    {
      heading: "5. Quantity & Submit",
      body: "Enter how much material you mixed, then Submit.",
      bullets: [
        "Normal mode: quantity in gallons (snaps to 0.25 gal steps).",
        "Cup gun: check “Cup gun?” and enter ounces instead.",
        "Paint uses 3.9% catalyst (~5 oz/gal); clear/primer use 4%. Confirm when prompted. Custom items can override % in Advanced.",
        "Your entry shows in today’s log (admins see more history and filters).",
      ],
    },
  ],
};
