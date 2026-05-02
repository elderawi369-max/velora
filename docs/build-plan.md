# Build Plan

## Build Principle

We are not trying to build the final company in version one.
We are trying to build the smallest professional product that can validate repeat text-based connection.

## Week 1: Repo And Core Setup

- scaffold frontend app
- scaffold backend app
- add shared naming conventions
- configure linting, formatting, and TypeScript
- set up local environment files

## Week 2: Auth And Profiles

- implement signup
- implement login
- create profile endpoint
- create profile edit flow
- add vibe tags
- add boundaries
- add profile list endpoint
- add profile detail endpoint

## Week 3: Chat And Reconnect

- create conversation model
- create message model
- create send message endpoint
- create list messages endpoint
- implement polling on chat screen
- add favorites
- add reconnect flow from chat history

## Week 4: Safety And Monetization

- block external contact patterns
- add new-account limits
- add report/block/mute
- add gift model
- add send gift endpoint
- render cosmetic rewards on profile
- add profile boost logic

## Week 5: Admin And Polish

- basic admin auth
- list reports
- review flagged content
- suspend profile
- improve empty states
- improve onboarding copy
- tighten profile and chat UX

## First Local Release Checklist

- users can sign up
- users can create profiles
- users can browse profiles
- users can favorite and reconnect
- users can send and receive messages
- users cannot share outside contact easily
- users can report bad behavior
- gifts work

## What We Defer Until Validation

- app store mobile apps
- voice notes
- uploaded media
- realtime sockets
- AI moderation
- AI writing assistant
- paid identity verification
- creator payouts

## Recommended First Coding Order

1. Backend schema and migrations
2. Backend auth routes
3. Frontend auth screens
4. Profile create and browse flows
5. Conversation creation and chat UI
6. Moderation filters
7. Gift system
8. Admin tools

## Technical Notes

- Use polling for message refresh in the MVP
- Start with preset avatars instead of uploads
- Keep usernames unique
- Store boundaries as structured selections, not just free text
- Make moderation rules configurable in code so we can tune them quickly
