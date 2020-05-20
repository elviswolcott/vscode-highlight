#!/bin/bash
# build & extract in CI
ci () [[ -n $CI ]]

ci && echo "running in CI environment"
ci && exit 0
exit 3