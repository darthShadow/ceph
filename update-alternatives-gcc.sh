versions=(14 13)
i=10
for v in ${versions[*]}; do
    echo -e '\e[1;49;36m'"gcc-${v}"'\e[0m' >&2
    cmd_str_install="sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-$v $i\n"
    cmd_str_slaves=$(
        dpkg -L "gcc-$v" "g++-$v" "gcc-$v-x86-64-linux-gnu" "g++-$v-x86-64-linux-gnu" |
            awk -F'/bin/' '/.*bin\// {print $2}' |
                while read -r line; do
                    [[ "$line" == "gcc-$v" ]] && continue
                    cmd=${line%-*}
                    echo "  --slave /usr/bin/$cmd $cmd /usr/bin/$line"
                done
    )
    # remove trailing newline and backslash split each slave section
    echo -ne "$cmd_str_install$cmd_str_slaves" | sed -z 's/\n$//' | sed -z 's/\n/ \\\n/g'
    echo
    i=$((i + 10))
done
