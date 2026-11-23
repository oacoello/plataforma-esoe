FROM postgres:16-alpine@sha256:f2f98726820d0342055351c6e9d36e705f5bfffb3dd53ff556325114b08afb6d

RUN mkdir /respaldos && chown postgres:postgres /respaldos && chmod 700 /respaldos
COPY --chmod=0555 deploy/respaldar.sh /usr/local/bin/esoe-respaldar
USER postgres
ENTRYPOINT ["/usr/local/bin/esoe-respaldar"]
