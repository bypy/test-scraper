import sys
import os

source_dir = sys.argv[1]
target_file = os.sys.argv[2]

files = [source_dir + "\\" + f + "\n" for f in os.listdir(source_dir)]
with open(os.getcwd() + "\\" + target_file, "w") as out:
    out.writelines(files)

