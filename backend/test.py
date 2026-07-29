import json
import re
import os

transcript_path = r'C:\Users\aman kesarwani201\.gemini\antigravity\brain\7fc3a4f2-81e7-4949-8731-56ea88b7e315\.system_generated\logs\transcript_full.jsonl'

file_contents = {}

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            step = json.loads(line)
        except:
            continue
            
        # Parse output for view_file
        if 'content' in step and 'File Path: ile:///' in step['content']:
            content = step['content']
            match = re.search(r'File Path: ile:///(.*?)', content)
            if match:
                path_match = match.group(1).replace('%20', ' ')
                path_match = path_match.replace('/', '\\\\')
                
                lines = content.split('\n')
                code_lines = []
                in_code = False
                for l in lines:
                    if re.match(r'^\d+: ', l):
                        in_code = True
                        code_lines.append(l.split(': ', 1)[1])
                    elif in_code and l.startswith('The above content shows the entire'):
                        in_code = False
                
                if code_lines:
                    file_contents[path_match.lower()] = '\n'.join(code_lines)

print("Keys found in transcript:")
for k in file_contents.keys():
    print(k)

