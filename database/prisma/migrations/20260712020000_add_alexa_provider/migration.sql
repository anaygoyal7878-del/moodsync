-- Alexa reuses the existing SmartHomeConnection + OAuthToken tables — see
-- docs/ALEXA_ARCHITECTURE.md §5/§4. MoodSync issues its own tokens here
-- (it's the OAuth authorization server for this integration, not a
-- client), but the storage shape (a connection with an associated
-- OAuthToken row) is identical to every other smart-home provider.
ALTER TYPE "SmartHomeProvider" ADD VALUE 'ALEXA';
