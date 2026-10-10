# Tomato Outbound Sales: Call Flow, Tools and QA Guidelines

How a Max Grow sales call runs, which tool to use at each step, how to wrap up, and what QA
checks.

## The three tools

1. **Nugget**: shows the incoming ticket pop-up when an auto-dialled call connects. The ticket
   holds the merchant's general details: Unique ID (UID), merchant name, restaurant name, top-selling
   items and their DRR. After the call, Nugget's disposition panel is where the call is disposed.
2. **Merchant Dashboard**: used to look up and confirm full merchant details. Paste the UID from
   Nugget to pull the merchant's full name, email, phone number and restaurant details.
3. **Ad Studio**: used to configure and launch campaigns.

## 1. Opening and verification

When an auto-dialled call connects in Nugget, a ticket pops up with the merchant's details.

- **Greeting:** "Good morning, sir. My name is {your name}. I am calling from the Tomato team."
  (Use good afternoon / good evening as appropriate.)
- **Identity check:** confirm their name and restaurant name, and verify whether they are the
  owner.
- **Non-owners:** if the person answering is a manager or family member, ask: "Are you the right
  person to make financial decisions for this restaurant?"
  - If yes, proceed.
  - If no, ask when the owner will be available and schedule a callback. If they don't know,
    select an appropriate callback slot yourself.

## 2. Merchant lookup and pitch

Paste the merchant UID from Nugget into the Merchant Dashboard to pull their full name, email,
phone number and restaurant details. Confirm these details with the merchant (if they give a new
email, use the new one from now on), present the Max Grow plan, and address questions about
deductions and the commission structure (see the Max Grow playbook).

## 3. Campaign setup (Ad Studio)

If the merchant accepts:

- Copy their UID into Ad Studio and enter their email address.
- Select the **Max Grow** campaign.
- Set the start and end dates. The minimum campaign duration is one month.
- Clearly dictate the timeline to the merchant, for example: "Your campaign starts today,
  October 10th, and runs through November 10th for one month."

## 4. Closing and help offer

Deliver the standard closing lines: "Thank you for selecting our plan. Is there anything else I
can help you with today?" Assist with any general queries before ending the call.

## Handling complaints

If the merchant is complaining, show empathy and sympathy before anything else:

- "I am really sorry to hear that."
- "I can understand your concern."
- "I will definitely help you out of this problem."

## Post-call disposition and email templates

Once the call disconnects, the agent has a disposition timer in Nugget of about 1.5 minutes
(90 seconds) to wrap up:

- Send the appropriate email template based on the call outcome:
  - **Accepted:** send the campaign acceptance template with the campaign details.
  - **Rejected:** send the rejection template.
  - **Not interested / Not sure:** send the follow-up template.
  - **Callback:** select the callback date and time requested by the merchant, schedule the
    callback in the disposition settings, and send the callback template.
- Dispose of the call before the timer expires.

## Quality Assurance (QA)

QA deducts points and issues a penalised report card for any of the following:

- Failing to dispose of calls within the allocated time.
- Misrepresenting plan terms, for example claiming Max Grow deducts 15% or 30% instead of the
  fixed 20% on incremental sales.
- Skipping or incorrectly delivering the standard opening or closing lines.

Rules QA also checks:

1. Max Grow only deducts 20% on incremental value.
2. The owner or merchant can stop Max Grow whenever they want.
3. If the merchant is complaining, the agent must show empathy and sympathy.
