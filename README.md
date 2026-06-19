# Claude JSONL WebViewer

Build a website that allows a user to upload a claude jsonl session file and view it in a human readable format.
Example file: $HOME/.claude/projects/-usr-ports-security-browserpass-native/ad651047-3a49-42c8-968b-a586c6a3a1ab.jsonl

The main usecase is the human review and recreation of the session chat log (exchange between user and AI) from the jsonl file.
The focus is on the interaction, user prompt and AI response.

Add a collapsible/expandable one line summary at appropriate places for meta information like tool uses, file read, write... (to be defined, because I don't know what is actually included in the jsonl file).

After the upload, the jsonl file should be parsed and the result should read like a chat exchange. pretty much like it's on a web claude session.
Uploading a new file resets the view and shows the conversation for the new file.

Indexeddb should be used to cache the uploaded file, so a browser refresh would not loose it. It should only hold the uploaded jsonl file and recreate the view on refresh.
