#!/bin/bash
# Script de gerenciamento do Busca+

ACTION=${1:-start}

case $ACTION in
    start)
        echo -e "\n=== Iniciando containers ==="
        docker-compose up -d
        echo -e "\n=== Serviços iniciados! ==="
        echo "  Admin: http://localhost:3001/admin"
        echo "  Busca: http://localhost:3000"
        ;;
    stop)
        echo -e "\n=== Parando containers ==="
        docker-compose down
        ;;
    restart)
        echo -e "\n=== Reiniciando containers ==="
        docker-compose restart
        ;;
    build)
        echo -e "\n=== Buildando crawler (sem cache) ==="
        docker-compose build --no-cache crawler
        echo -e "\n=== Build concluído! ==="
        ;;
    init)
        echo -e "\n=== Inicializando banco de dados ==="
        docker-compose exec -T crawler node src/scripts/init-db.js
        docker-compose exec -T crawler node src/scripts/init-typesense.js
        echo -e "\n=== Banco inicializado! ==="
        ;;
    logs)
        echo -e "\n=== Logs ==="
        docker-compose logs -f
        ;;
    status)
        echo -e "\n=== Status dos Containers ==="
        docker-compose ps
        ;;
    clean)
        echo -e "\n=== ATENÇÃO: Limpando ambiente ==="
        read -p "Isso irá remover todos os dados. Continuar? (s/N) " confirm
        if [ "$confirm" = "s" ]; then
            docker-compose down -v
            rm -rf screenshots/* images/*
            echo -e "\n=== Ambiente limpo! ==="
        fi
        ;;
    *)
        echo "Uso: ./manage.sh [start|stop|restart|build|init|logs|status|clean]"
        ;;
esac
