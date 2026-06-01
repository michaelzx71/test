#!/bin/sh
cd "$(dirname "$0")" || exit 1
node scripts/build-update-package.mjs
printf "\n按回车键关闭窗口..."
read _
