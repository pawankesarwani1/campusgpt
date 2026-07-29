import json
import re

transcript_path = r'C:\Users\aman kesarwani201\.gemini\antigravity\brain\7fc3a4f2-81e7-4949-8731-56ea88b7e315\.system_generated\logs\transcript_full.jsonl'

keys = []

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'File Path: ile:///' in line:
            try:
                step = json.loads(line)
            except:
                continue
            
            raw = step.get('content', '')
            if isinstance(raw, str) and 'File Path: ile:///' in raw:
                match = re.search(r'File Path: ile:///(.*?)', raw)
                if match:
                    path_match = match.group(1).replace('%20', ' ').replace('/', '\\')
                    keys.append(path_match)

# And write_to_file
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'write_to_file' in line:
            try:
                step = json.loads(line)
                if 'tool_calls' in step:
                    for tc in step['tool_calls']:
                        if tc.get('name') == 'write_to_file':
                            args = tc.get('args', {})
                            if 'TargetFile' in args:
                                keys.append(args['TargetFile'])
            except:
                pass

print("Extracted Paths:")
for k in set(keys):
    print(k)

