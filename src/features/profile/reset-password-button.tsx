"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ResetPasswordButton() {
    const [shown, setShown] = useState(false);
    return (
        <div className="text-right">
            <Button variant="secondary" onClick={() => setShown(true)}>
                Redefinir senha
            </Button>
            {shown && <p role="status" className="mt-2 max-w-52 text-xs text-slate-500">Neste protótipo a redefinição é ilustrativa: nenhuma senha foi alterada.</p>}
        </div>
    );
}